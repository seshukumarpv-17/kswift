# K-SWIFT – Smart Water Innovation For Tomorrow

A Class 10 maths model of five interconnected lakes in the HMDA area, Hyderabad:
**Osman Sagar, Himayat Sagar, Durgam Cheruvu, Hussain Sagar and Saroornagar Lake.**

The exhibition model runs on **preset data** (no sensors). Every value in the app is marked **published** (with a source) or **preset** (a demo value the model uses).

Made for **RSBVP 2026-27**: Theme *Science, Technology, and Innovation for a Sustainable and Viksit Bharat*, Subtheme 3 *Mathematical Modelling and Computational Thinking*.

> School project. The alerts are not official flood warnings.

**Website / app:** https://seshukumarpv-17.github.io/kswift/

---

## Tabs

| Tab | What you see |
| --- | --- |
| **Lakes** | Side view of the five lakes at FTL height, a card per lake (volume, water now, area, elevation, level, pH, DO, BOD, WQI, location) and a comparison table. Tap a lake for **its own page with a real map** (street / satellite), size and volume, water quality with sources, location, links and substations, pollution |
| **Map** | All five lakes, links, substations and the Musi on one real map, or switch to the Class 10 coordinate grid; distance table |
| **Flood simulator** | Pick a storm. The water-balance rule runs every 10 minutes; the log shows alerts and which substation gate opened |
| **Maths** | Choose **Lake 1** and **Lake 2**. 18 widgets, each with the concept, where K-SWIFT uses it, the formula and the working for both lakes: distance, section formula, triangle area, slope (trigonometry), heights and distances, similarity, volumes, transfer pipe, circles and buffer, quadratic strip, pair of linear equations, hours to FTL, water balance, AP, statistics, WQI, probability, percentages and units |
| **Substations** | SS-1 to SS-6, one at the midpoint of each link: location, which interconnection it sits on, link length, drop and slope, and monitored values (flow, depth, gate, pH, DO, BOD, turbidity, TDS, temperature) |
| **Pollution control** | For each lake: sources of pollution, how it is removed now, what K-SWIFT adds; 12 removal methods; a treatment-efficiency calculator |

### Links and substations
| Link | From → to | Substation |
| --- | --- | --- |
| L1 | Osman Sagar → Himayat Sagar | SS-1 |
| L2 | Himayat Sagar → Hussain Sagar | SS-2 |
| L3 | Durgam Cheruvu → Hussain Sagar | SS-3 |
| L4 | Hussain Sagar → Saroornagar | SS-4 |
| L5 | Hussain Sagar → Musi (near Amberpet) | SS-5 |
| L6 | Saroornagar → Musi (near Nagole) | SS-6 |

### The alert algorithm
1. Hours to FTL = free space ÷ (net inflow × 0.0283 × 3600)
2. **Red** if a lake is at FTL or less than 6 hours away
3. **Amber** if it is 90% full or more, DO is under 4 mg/L, or pH is outside 6.5–8.5
4. Red lake → open the substation gate to a linked **lower** lake that is under 80% full and has the most free space; otherwise release to the Musi
5. DO under 4 mg/L → aerator on; dirty water is treated before a gate sends it on

---

## Install as an app
- **Laptop (Chrome / Edge):** open the website and click **Install app** (or the install icon in the address bar).
- **Android:** Chrome → ⋮ → **Add to Home screen** → Install.
- **iPhone / iPad:** Safari → Share → **Add to Home Screen**.
- **Offline copy:** download the zip from GitHub (Code → Download ZIP) and open `index.html`.

Everything except the map tiles works without internet.

## Files
```
index.html              the app
css/style.css           look and layout
js/model.js             preset data, links, substations, WQI, alert algorithm (tested)
js/app.js               screens, maps, simulator, maths widgets
manifest.json, sw.js    installable app + offline cache
tests/model.test.js     22 checks against the worked examples
firmware/               ESP32 code from the earlier sensor version (not used by the preset model)
```
No build step. Maps use Leaflet 1.9.4 (BSD-2 licence) from unpkg. Check the maths with `node tests/model.test.js`.

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

| Hussain Sagar STPs (30, 20, 5 MLD → 60, 40, 10 MLD) | [Telangana Today](https://telanganatoday.com/hyderabad-capacity-of-hussain-sagar-stps-to-be-doubled), [HMDA presentation](https://www.slideshare.net/slideshow/hussainsagar-presentation-by-hmda/14908891) |
| Kukatpally nala sewage (about 155 MLD) | [Telangana Today](https://telanganatoday.com/17-stps-coming-up-along-musi) |
| Durgam Cheruvu ground height ≈ 1,893 ft (preset elevation) | [topographic-map.com](https://en-us.topographic-map.com/map-39kgp/Sangareddy/) |
| Saroornagar elevation 487 m (preset elevation), 99 acres, max depth 6.1 m, restored 2003–04 | [Wikipedia: Saroornagar](https://en.wikipedia.org/wiki/Saroornagar), [Saroornagar Lake](https://en.wikipedia.org/wiki/Saroornagar_Lake) |

**Preset values:** no official FTL is published for Durgam Cheruvu or Saroornagar, so the model uses the ground heights above. Their levels (70% and 60%), all substation readings, pH/DO/BOD/turbidity for the two reservoirs, and turbidity, TDS and temperature for the city lakes are preset demo values. Saroornagar's volume (1.42 million m³) is an estimate.

## License

MIT – see `LICENSE`.
