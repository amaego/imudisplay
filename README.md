# IMU Display – web version

Web version of `plot_imu_display.py`. It shows the three IMU modules in 3D and moves them with the
quaternions received from the device:

```
Q1[w,x,y,z] Q2[w,x,y,z] Q3[w,x,y,z]
```

- Q3 → red module (center, carries the X/Y/Z axes and drives the compass heading)
- Q2 → blue module (+X)
- Q1 → green module (−X)

Connections: **Bluetooth** (Web Bluetooth, Nordic UART TX `6E400003…`), **Serial** (Web Serial, default
115200 baud) and **Demo** (simulated data, no hardware needed).

## Run it

Browsers only allow Bluetooth / Serial on `https://` or `http://localhost`, and ES modules don't load
from `file://`, so serve the folder with any web server:

```
cd imu_display_web
python serve.py            # opens http://127.0.0.1:8000 in the browser
python serve.py 8001       # another port
python serve.py --demo     # start with simulated data
```

The terminal stays busy while the server runs (that is normal); press Ctrl+C to stop it.
If the browser didn't open by itself, open <http://127.0.0.1:8000> in **Chrome or Edge**.
`http://127.0.0.1:8000/?demo` starts the simulation directly.

To use it from other devices (e.g. a phone), host the folder on an `https://` server (GitHub Pages,
Netlify, …). Everything is local (three.js is in `lib/`), so it also works without internet.

## Browser support

| Feature   | Chrome / Edge (Windows, macOS, Linux) | Chrome Android | Firefox / Safari |
|-----------|----------------------------------------|----------------|------------------|
| Bluetooth | ✅ (Linux: may need `chrome://flags/#enable-experimental-web-platform-features`) | ✅ | ❌ |
| Serial    | ✅                                     | ❌             | ❌               |
| Demo      | ✅                                     | ✅             | ✅               |

## Files

- `index.html`, `style.css` – page and layout
- `app.js` – scene, parsing, Bluetooth / Serial; settings (colors, joint shape, anchors, camera) are the
  constants at the top, same names and values as in `plot_imu_display.py`
- `assets/hpc-UT-module-brush.obj` – module model (copy of `assets/obj/hpc-UT-module-brush.obj`)
- `lib/three/` – three.js 0.160.0
