# K-SWIFT – Smart Water Innovation For Tomorrow

A Class 10 maths model of five interconnected lakes in the HMDA area, Hyderabad:
**Osman Sagar, Himayat Sagar, Durgam Cheruvu, Hussain Sagar and Saroornagar Lake.**

The app shows how full each lake is and checks its water quality. It warns before a lake reaches its Full Tank Level (FTL) and decides where surplus water should go. It also connects to an ESP32 exhibition model over USB.

Made for **RSBVP 2026-27**: Theme *Science, Technology, and Innovation for a Sustainable and Viksit Bharat*, Subtheme 3 *Mathematical Modelling and Computational Thinking*.

> School project. The alerts are not official flood warnings.

**Live app:** https://seshukumarpv-17.github.io/kswift/

---

## What the app does

| Tab | What you see |
| --- | --- |
| **Lakes** | Side view of the five lakes at their real FTL heights, plus a card for each lake: % full, level, pH, DO, WQI, hours to FTL and a green / amber / red status |
| **Map** | The lakes on a Class 10 coordinate grid (origin 17.30°N, 78.30°E, 1 square = 1 km), with distances from the distance formula |
| **Flood simulator** | Pick a storm (rain, hours, runoff). The water-balance rule runs every 10 minutes and shows which lakes overflow and where the algorithm sends the surplus |
| **Maths** | 16 live calculators: distance and section formula, triangle area, trigonometry, similar triangles, volumes, circles, linear and quadratic equations, AP, statistics, probability, WQI |
| **Model sensors** | Connect the ESP32 by USB, type in your own field readings, and set the FTL marks and time scale |

### The alert algorithm (same as the project write-up)

1. Rise per hour = (level now − level a little earlier) ÷ time
2. Hours to FTL = (100% − % full now) ÷ rise per hour
3. **Red** if the lake is at FTL or less than 6 hours away
4. **Amber** if it is 90% full or more, DO is under 4 mg/L, or pH is outside 6.5–8.5
5. Red lake → send the surplus to a **lower** lake that is under 80% full and has the most free space; if there is none, release it to the Musi
6. DO under 4 mg/L → switch on the aerator

---

## Files

```
index.html              the app (open this)
css/style.css           look and layout
js/model.js             lake data, WQI, alert algorithm, routing (pure maths, tested)
js/app.js               screens, map, simulator, calculators, USB connection
manifest.json, sw.js    lets the app install on a phone and open offline
icons/                  app icons
firmware/kswift_esp32/  Arduino code for the ESP32 model
tests/model.test.js     checks the maths against the worked examples
```

No build step, no npm packages. It is plain HTML, CSS and JavaScript.

---

## 1. Try it on your laptop

Double-click `index.html`. It opens in your browser and works without internet (fonts fall back to system fonts).

To connect the ESP32 over USB, open `index.html` in **Chrome or Edge on a laptop**. Phones and Firefox do not support USB serial.

---

## 2. Put it on GitHub

### Option A – no software needed (website upload)

1. Sign in at [github.com](https://github.com) and click **New repository**.
2. Name it `kswift`, choose **Public**, tick **Add a README file**, then **Create repository**.
3. Click **Add file → Upload files**.
4. Unzip `kswift.zip` on your computer. Open the `kswift` folder, select **everything inside it** (not the folder itself) and drag it onto the GitHub page. The folders `css`, `js`, `icons`, `firmware` and `tests` upload with their files.
5. Write a message such as `First version of K-SWIFT` and click **Commit changes**.
6. GitHub asks whether to replace the README. Yes – this README replaces the empty one.

### Option B – with Git

```bash
cd kswift
git init
git add .
git commit -m "First version of K-SWIFT"
git branch -M main
git remote add origin https://github.com/<your-username>/kswift.git
git push -u origin main
```

---

## 3. Publish it as a website (free)

### GitHub Pages
1. In your repository open **Settings → Pages**.
2. Under *Build and deployment*, choose **Deploy from a branch**, branch **main**, folder **/ (root)**, then **Save**.
3. After a minute the site appears at `https://<your-username>.github.io/kswift/`.

### Or Vercel (where the earlier K-SWIFT site lives)
1. On [vercel.com](https://vercel.com) choose **Add New → Project** and import the `kswift` repository.
2. Framework preset: **Other**. Leave the build command empty. Click **Deploy**.
3. Every time you commit to GitHub, Vercel updates the site by itself.

On a phone, open the site and choose **Add to Home screen**. K-SWIFT then opens like an app, even offline.

---

## 4. The ESP32 model

### Parts
ESP32 Dev board, 2 × HC-SR04P ultrasonic sensors (3.3 V version), an analog pH sensor module with pH 4 and pH 7 buffers, an analog turbidity module, 4 × SG90 servos, a 1-channel relay, a red/amber/green LED set with 3 × 220 Ω resistors, a buzzer, a small fountain or air pump, and a 5 V 2 A supply for the servos.

### Wiring (default pins – change them at the top of the sketch)

| Part | ESP32 pin | Notes |
| --- | --- | --- |
| Osman Sagar level sensor | TRIG 5, ECHO 18 | HC-SR04P, or 1 kΩ + 2 kΩ divider on ECHO for a 5 V HC-SR04 |
| Hussain Sagar level sensor | TRIG 19, ECHO 21 | same |
| pH module output | 34 | through a 10 kΩ + 10 kΩ divider |
| Turbidity module output | 35 | through a 10 kΩ + 10 kΩ divider |
| Valve Osman → Himayat (servo) | 13 | servo power from the 5 V supply, grounds joined |
| Valve Himayat → Hussain (servo) | 14 | |
| Valve Hussain → Saroornagar (servo) | 27 | |
| Valve Hussain → Musi outlet (servo) | 26 | |
| Hussain traffic light R / A / G | 25 / 33 / 32 | each LED through 220 Ω |
| Buzzer | 23 | |
| Aerator relay input | 4 | most relay boards switch on when LOW |

### Upload the firmware
1. Install the [Arduino IDE](https://www.arduino.cc/en/software).
2. **File → Preferences → Additional boards manager URLs**: `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
3. **Tools → Board → Boards Manager**: install **esp32 by Espressif Systems**.
4. **Tools → Manage Libraries**: install **ESP32Servo**.
5. Open `firmware/kswift_esp32/kswift_esp32.ino`, choose board **ESP32 Dev Module** and your COM port, then click **Upload**.
6. Open the Serial Monitor at **115200** baud. You should see `# K-SWIFT model ready` and then lines like `LAKE=hussain;DEPTH_CM=11.2;PH=7.40;TURB=40`.
7. **Close the Serial Monitor**, because only one program can use the port. Then open the app, go to **Model sensors** and click **Connect model**.

### Calibrate
- **Level:** in the sketch, set `sensorToBottomCm` (sensor face to the floor of the box) and `ftlMarkCm` (height of your red FTL line). Put the same FTL mark in the app under *Model settings*.
- **pH:** dip the probe in pH 7 buffer, type `CAL` in the Serial Monitor and copy the volts into `PH7_VOLTS`. Do the same with pH 4 buffer for `PH4_VOLTS`, then upload again. The sketch draws a straight line through these two points (Class 10: equation of a line).
- **Turbidity:** the module's curve is approximate. Check it against a turbidity tube.
- **Time scale:** in the app, 60 means 1 minute on the model = 1 hour on the real lake, so the 6-hour red warning becomes 6 minutes on the model.

### How the app and the ESP32 talk (one line each, 115200 baud)

ESP32 → app, every 2 seconds:
```
LAKE=hussain;DEPTH_CM=11.2;PH=7.40;TURB=40
# messages that start with # are shown in the log
```
App → ESP32, only when a decision changes:
```
LED hussain RED            (or AMBER / GREEN)
VALVE hussain saroor OPEN  send surplus to a lower lake
VALVE hussain CLOSE        close every pipe from that lake
MUSI hussain               open the outlet into the Musi channel
AERATOR hussain ON         (or OFF)
```
If the laptop is unplugged, the ESP32 still opens Hussain Sagar's Musi outlet and sounds the buzzer when the water reaches the FTL mark.

**Why the app sends Hussain Sagar's surplus to the Musi and not to Saroornagar:** water may only go to a lake with a *lower* known FTL, and Saroornagar's height is not published. Measure it in Google Earth Pro and enter it under *Model settings*. If it is lower, the Hussain → Saroornagar valve will be used.

---

## 5. Check the maths

```bash
node tests/model.test.js
```
The 17 checks cover the distance formula (Hussain Sagar to Durgam Cheruvu = 9.0 km), unit conversion (3.90 TMC = 110.4 million m³), the WQI example (323, unfit), every alert rule, hours to FTL, and the routing rules.

---

## Data sources

| Data | Source |
| --- | --- |
| Lake IDs, coordinates, 2,857 lakes in HMDA area | [HMDA lake list](https://www.hmda.gov.in/wp-content/uploads/2020/07/RevisedLakes.pdf), [HMDA lakes portal](https://lakes.hmda.gov.in/SWC/rpt_lakes.aspx/) |
| Osman Sagar / Himayat Sagar FTL and storage | HMWSSB figures reported by [Telangana Today](https://telanganatoday.com/hyderabad-water-board-monitors-rising-levels-in-osmansagar-and-himayatsagar-reservoirs) |
| Hussain Sagar FTL 513.41 m, MWL 514.75 m, capacity, catchment | GHMC figures reported by [Telangana Today](https://telanganatoday.com/hyderabad-heavy-inflows-in-hussain-sagar-ghmc-on-alert) |
| Durgam Cheruvu DO 0.3 mg/L, BOD 12 mg/L (May 2026) | TGPCB data reported by [Deccan Chronicle](https://www.deccanchronicle.com/amp/southern-states/telangana/fish-deaths-at-durgam-cheruvu-linked-to-oxygen-depletion-1983825) |
| Saroornagar pH 7.24, DO 2.0, BOD 5.4 (Dec 2023) | TSPCB data reported by [The Hans India](https://www.thehansindia.com/news/cities/hyderabad/a-once-serene-place-turns-into-thriving-residential-hub-in-city-905694) |
| Hussain Sagar DO readings, WQI 100–300 | [Springer, 2026](https://link.springer.com/article/10.1007/s12665-026-12872-x) |
| Twin-reservoir NSF-WQI | [NIT Rourkela study](https://dspace.nitrkl.ac.in/dspace/handle/2080/3932) |
| CPCB water-quality classes | TGPCB report to the [NGT](https://www.greentribunal.gov.in/sites/default/files/news_updates/OA%2022%20of%202024%20Report%20by%20R2%20&%20R3.pdf) |

The FTL heights of Durgam Cheruvu and Saroornagar are not published. Measure them yourself in Google Earth Pro. Saroornagar's volume (1.42 million m³) is an estimate.

## License

MIT – see `LICENSE`.
