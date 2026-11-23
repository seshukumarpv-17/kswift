/*
  K-SWIFT – ESP32 firmware for the 5-lake exhibition model
  ---------------------------------------------------------
  What it does
    1. Measures the water depth in each lake box with an ultrasonic sensor (HC-SR04).
    2. Reads pH and turbidity from the probes in the Hussain Sagar box.
    3. Sends one line per lake to the K-SWIFT app over USB, every 2 seconds:
         LAKE=hussain;DEPTH_CM=11.2;PH=7.40;TURB=40
    4. Obeys commands the app sends back (one per line):
         LED hussain RED | AMBER | GREEN
         VALVE hussain saroor OPEN     (open the pipe from one lake to another)
         VALVE hussain CLOSE           (close every pipe leaving that lake)
         MUSI hussain                  (open that lake's outlet to the Musi channel)
         AERATOR hussain ON | OFF      (fountain pump for low dissolved oxygen)
    5. Safety rule that works even with no laptop connected:
         if Hussain Sagar's water reaches its red FTL mark, open its outlet and sound the buzzer.

  Libraries (Arduino IDE → Tools → Manage Libraries): "ESP32Servo" by Kevin Harrington.
  Board: "ESP32 Dev Module" (install "esp32 by Espressif Systems" in Boards Manager).
  Serial speed: 115200 baud (the app uses the same).

  IMPORTANT – voltages: the ESP32 works at 3.3 V.
    - Use HC-SR04P (3.3 V version), or put a divider (1 kΩ + 2 kΩ) on each ECHO wire.
    - pH and turbidity modules give up to 5 V: put a divider (10 kΩ + 10 kΩ) on their output
      and keep PH_DIVIDER / TURB_DIVIDER = 2.0 below.
*/

#include <ESP32Servo.h>

// ---------------- 1. Lakes with a level sensor ----------------
// sensorToBottomCm = distance from the sensor face down to the floor of the box (measure it with a ruler).
// ftlMarkCm        = height of the red FTL line above the floor (must match "FTL mark in box" in the app).
// Set trig = -1 for a lake that has no sensor.
struct LakeSensor {
  const char* id;
  int trig;
  int echo;
  float sensorToBottomCm;
  float ftlMarkCm;
};

LakeSensor LAKES[] = {
  {"osman",   5, 18, 25.0, 15.0},
  {"himayat", -1, -1, 25.0, 15.0},
  {"durgam",  -1, -1, 25.0, 15.0},
  {"hussain", 19, 21, 25.0, 15.0},
  {"saroor",  -1, -1, 25.0, 15.0},
};
const int NUM_LAKES = sizeof(LAKES) / sizeof(LAKES[0]);

// ---------------- 2. Water-quality probes (in the Hussain Sagar box) ----------------
const char* QUALITY_LAKE = "hussain";
const int PIN_PH   = 34;      // analog input only
const int PIN_TURB = 35;      // analog input only
const float PH_DIVIDER   = 2.0;   // 10k + 10k divider → module volts = pin volts × 2
const float TURB_DIVIDER = 2.0;

// pH calibration: dip the probe in pH 7 buffer, note "pH volts" from the Serial Monitor (type CAL),
// then in pH 4 buffer. Write both numbers here and upload again.
float PH7_VOLTS = 2.50;
float PH4_VOLTS = 3.05;

// ---------------- 3. Valves (servo motors pinching or turning a tap) ----------------
// from → to. "musi" means the outlet into the river channel.
struct Valve {
  const char* from;
  const char* to;
  int pin;
  Servo servo;
  bool open;
};
Valve VALVES[] = {
  {"osman",   "himayat", 13, Servo(), false},
  {"himayat", "hussain", 14, Servo(), false},
  {"hussain", "saroor",  27, Servo(), false},
  {"hussain", "musi",    26, Servo(), false},
};
const int NUM_VALVES = sizeof(VALVES) / sizeof(VALVES[0]);
const int SERVO_CLOSED = 0;    // degrees – adjust to your tap
const int SERVO_OPEN   = 90;

// ---------------- 4. Lights, buzzer, aerator ----------------
// Traffic light beside the Hussain Sagar box (add more lakes the same way if you have pins).
struct Light { const char* id; int red; int amber; int green; };
Light LIGHTS[] = {
  {"hussain", 25, 33, 32},
};
const int NUM_LIGHTS = sizeof(LIGHTS) / sizeof(LIGHTS[0]);
const int PIN_BUZZER  = 23;
const int PIN_AERATOR = 4;     // relay input for the small fountain / air pump
const bool RELAY_ACTIVE_LOW = true;   // most blue relay boards switch ON when the input is LOW

// ---------------- timing ----------------
const unsigned long SEND_EVERY_MS = 2000;
unsigned long lastSend = 0;
bool safetyOpen = false;            // true while the offline safety rule holds the outlet open
unsigned long lastAppCommand = 0;   // when the app last talked to us

// ======================================================================

float readDepthCm(const LakeSensor& L) {
  if (L.trig < 0) return NAN;
  // take 5 readings and use the median, so one bad echo does not spoil the value
  float v[5];
  for (int i = 0; i < 5; i++) {
    digitalWrite(L.trig, LOW);  delayMicroseconds(3);
    digitalWrite(L.trig, HIGH); delayMicroseconds(10);
    digitalWrite(L.trig, LOW);
    unsigned long us = pulseIn(L.echo, HIGH, 30000UL);   // time out after 30 ms
    v[i] = us == 0 ? NAN : us * 0.0343f / 2.0f;          // distance to the water in cm
    delay(15);
  }
  // simple sort of 5 values (NAN goes to the end)
  for (int i = 0; i < 4; i++) for (int j = i + 1; j < 5; j++) {
    bool swap = isnan(v[i]) ? !isnan(v[j]) : (!isnan(v[j]) && v[j] < v[i]);
    if (swap) { float t = v[i]; v[i] = v[j]; v[j] = t; }
  }
  int good = 0; for (int i = 0; i < 5; i++) if (!isnan(v[i])) good++;
  if (good == 0) return NAN;
  float distance = v[good / 2];
  float depth = L.sensorToBottomCm - distance;     // water height above the floor of the box
  if (depth < 0) depth = 0;
  return depth;
}

float readVolts(int pin, float divider) {
  long sum = 0;
  for (int i = 0; i < 20; i++) { sum += analogReadMilliVolts(pin); delay(2); }
  return (sum / 20.0f) / 1000.0f * divider;
}

float readPH() {
  float v = readVolts(PIN_PH, PH_DIVIDER);
  // straight line through the two calibration points (Class 10: two-point form of a line)
  float slope = (7.0f - 4.0f) / (PH7_VOLTS - PH4_VOLTS);
  return 7.0f + (v - PH7_VOLTS) * slope;
}

float readTurbidityNTU() {
  float v = readVolts(PIN_TURB, TURB_DIVIDER);
  // curve published for the common analog turbidity module (approximate; clear water ≈ 4.2 V)
  float ntu = -1120.4f * v * v + 5742.3f * v - 4352.9f;
  if (v >= 4.2f || ntu < 0) ntu = 0;
  if (ntu > 3000) ntu = 3000;
  return ntu;
}

void relay(int pin, bool on) { digitalWrite(pin, (on ^ RELAY_ACTIVE_LOW) ? HIGH : LOW); }

void setValve(Valve& v, bool open) {
  if (v.open == open) return;
  v.servo.write(open ? SERVO_OPEN : SERVO_CLOSED);
  v.open = open;
  Serial.printf("# valve %s -> %s %s\n", v.from, v.to, open ? "OPEN" : "CLOSED");
}

void closeValvesFrom(const String& from) {
  for (int i = 0; i < NUM_VALVES; i++) if (from == VALVES[i].from) setValve(VALVES[i], false);
}

bool openValve(const String& from, const String& to) {
  for (int i = 0; i < NUM_VALVES; i++)
    if (from == VALVES[i].from && to == VALVES[i].to) { setValve(VALVES[i], true); return true; }
  return false;
}

void setLight(const String& id, const String& colour) {
  for (int i = 0; i < NUM_LIGHTS; i++) if (id == LIGHTS[i].id) {
    digitalWrite(LIGHTS[i].red,   colour == "RED");
    digitalWrite(LIGHTS[i].amber, colour == "AMBER");
    digitalWrite(LIGHTS[i].green, colour == "GREEN");
  }
  if (id == "hussain") digitalWrite(PIN_BUZZER, colour == "RED");
}

// --------------- commands from the app ---------------
void handleCommand(String line) {
  line.trim();
  if (line.length() == 0) return;
  lastAppCommand = millis();
  String w[4]; int n = 0, start = 0;
  for (int i = 0; i <= (int)line.length() && n < 4; i++) {
    if (i == (int)line.length() || line[i] == ' ') {
      if (i > start) w[n++] = line.substring(start, i);
      start = i + 1;
    }
  }
  String cmd = w[0]; cmd.toUpperCase();
  String a = w[1]; a.toLowerCase();
  String b = w[2]; b.toLowerCase();
  String c = w[3]; c.toUpperCase();
  String b2 = w[2]; b2.toUpperCase();

  if (cmd == "LED" && n >= 3) { setLight(a, b2); }
  else if (cmd == "VALVE" && n >= 3 && b2 == "CLOSE") { closeValvesFrom(a); }
  else if (cmd == "VALVE" && n >= 4 && c == "OPEN") {
    if (!openValve(a, b)) {
      Serial.printf("# no pipe from %s to %s on this model – opening Musi outlet instead\n", a.c_str(), b.c_str());
      openValve(a, "musi");
    }
  }
  else if (cmd == "MUSI" && n >= 2) { if (!openValve(a, "musi")) Serial.printf("# %s has no Musi outlet valve\n", a.c_str()); }
  else if (cmd == "AERATOR" && n >= 3) { relay(PIN_AERATOR, b2 == "ON"); Serial.printf("# aerator %s\n", b2.c_str()); }
  else if (cmd == "CAL") {
    Serial.printf("# pH volts = %.3f  (put these in PH7_VOLTS / PH4_VOLTS)\n", readVolts(PIN_PH, PH_DIVIDER));
    Serial.printf("# turbidity volts = %.3f\n", readVolts(PIN_TURB, TURB_DIVIDER));
  }
  else Serial.printf("# unknown command: %s\n", line.c_str());
}

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  for (int i = 0; i < NUM_LAKES; i++) if (LAKES[i].trig >= 0) {
    pinMode(LAKES[i].trig, OUTPUT); pinMode(LAKES[i].echo, INPUT);
  }
  for (int i = 0; i < NUM_LIGHTS; i++) {
    pinMode(LIGHTS[i].red, OUTPUT); pinMode(LIGHTS[i].amber, OUTPUT); pinMode(LIGHTS[i].green, OUTPUT);
    digitalWrite(LIGHTS[i].green, HIGH);
  }
  pinMode(PIN_BUZZER, OUTPUT);  digitalWrite(PIN_BUZZER, LOW);
  pinMode(PIN_AERATOR, OUTPUT); relay(PIN_AERATOR, false);
  for (int i = 0; i < NUM_VALVES; i++) {
    VALVES[i].servo.setPeriodHertz(50);
    VALVES[i].servo.attach(VALVES[i].pin, 500, 2400);
    VALVES[i].servo.write(SERVO_CLOSED);
  }
  Serial.println("# K-SWIFT model ready");
}

void loop() {
  // read any commands waiting from the app
  static String buf;
  while (Serial.available()) {
    char ch = (char)Serial.read();
    if (ch == '\n' || ch == '\r') { if (buf.length()) handleCommand(buf); buf = ""; }
    else if (buf.length() < 80) buf += ch;
  }

  if (millis() - lastSend < SEND_EVERY_MS) return;
  lastSend = millis();

  for (int i = 0; i < NUM_LAKES; i++) {
    LakeSensor& L = LAKES[i];
    if (L.trig < 0) continue;
    float depth = readDepthCm(L);
    if (isnan(depth)) { Serial.printf("# %s: no echo – check the sensor\n", L.id); continue; }

    Serial.printf("LAKE=%s;DEPTH_CM=%.1f", L.id, depth);
    if (strcmp(L.id, QUALITY_LAKE) == 0) {
      Serial.printf(";PH=%.2f;TURB=%.0f", readPH(), readTurbidityNTU());
    }
    Serial.println();

    // Offline safety rule: the model protects itself even if the laptop is unplugged.
    bool appQuiet = millis() - lastAppCommand > 10000;
    if (strcmp(L.id, "hussain") == 0 && appQuiet) {
      if (depth >= L.ftlMarkCm && !safetyOpen) {
        openValve("hussain", "musi"); setLight("hussain", "RED"); safetyOpen = true;
        Serial.println("# safety: Hussain Sagar at FTL – outlet opened");
      } else if (depth < L.ftlMarkCm - 1.0 && safetyOpen) {
        closeValvesFrom("hussain"); setLight("hussain", "GREEN"); safetyOpen = false;
        Serial.println("# safety: level back below FTL – outlet closed");
      }
    }
  }
}
