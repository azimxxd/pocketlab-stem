# Device test matrix (E0)

Production: https://pocketlab-stem.vercel.app — open it on the phone itself, not through a messenger's in-app browser.

For every device fill one column. A missing device is an open item, not a pass. Write what was observed, not what was expected; attach exported JSON of the attempts where noted.

## Devices

| Field | Device 1 | Device 2 | Device 3 |
|---|---|---|---|
| Model | | | |
| OS version | | | |
| Browser + version | | | |
| Installed as app (PWA)? | | | |
| Tester, date | | | |

## Checks

| # | Check | How | Record |
|---|---|---|---|
| 1 | Install | Android Chrome: menu → «Установить приложение». iPhone Safari: «Поделиться → На экран Домой». Open from the icon. | Installed? Opens standalone? |
| 2 | Offline | After first load, airplane mode, reopen from the icon, open each lab. | Which labs work offline |
| 3 | Update prompt | After a new deploy, reopen: banner «Доступна новая версия» appears; «Обновить» reloads only when pressed. | Seen / not seen |
| 4 | Microphone (S1) | «Увидь свой голос» → Микрофон → whistle 5 s. | Permission prompt text; peak Hz; actual audio settings from JSON (`audioSettings`) |
| 5 | Reference tone (S1) | Play a 440 Hz tone from another device 30 cm away. | Reported Hz (bin-centre, so ±12 Hz expected) |
| 6 | Bottle (S2) | 1,5 l bottle, 5 water levels × 3 blows. | Tone found per blow? Spread Hz; best model; export JSON |
| 7 | Motion permission (M2) | «Что чувствует телефон?» → «Начать запись». | iPhone: permission prompt shown? Android: data without prompt? |
| 8 | Event rate (M2) | Phone flat 3 s. | «событий/с», gaps, |a| at rest |
| 9 | Axes and units (M2) | Flat → stand on the long edge → rotate 90° on the table. | Tilt vs gyro per movement; sign of ω; is gyro ≈ 90° (deg/s units) or ≈ 1.6 (rad/s)? |
| 10 | Screen lock (M2/S1) | Start a recording and wait 40 s without touching. | Did the screen stay on? |
| 11 | Interruption | Start any recording, switch app. | «прервана» shown, microphone indicator off |
| 12 | Pendulum timer (M1) | Timer 10 periods on a 0.5 m string, 3 repeats. | Periods; spread |
| 13 | Camera import (V1) | «Видео» → «Выбрать или снять видео» → record a throw with a ruler, ≤ 10 s. | Container time «из файла»? Frame check «совпали / расхождений»; frame interval; variable? |
| 14 | Slow motion (V1) | Import a slow-motion clip. | Timebase issues shown? |
| 15 | Manual g (V1) | Scale + ≥ 10 marks by finger. | g; fit spread; tilt |
| 16 | Tracker (V1) | Same clip, «Трекинг». | Frames tracked; stop reason; time taken; g |
| 17 | Bounce (V2) | Drop a ball, mark contact. | h₂/h₁ |
| 18 | Export | JSON/CSV from a lab and from the notebook. | Share sheet or download? File opens? |
| 19 | Storage | Save several records; check the notebook footer. | «браузер не удалит» shown? Records still there next day? |
| 20 | Layout | Portrait and landscape, 200% text size. | Clipped or overlapping elements |

## Results

Record findings in `docs/VALIDATION.md` under a dated «Device tests» section with the device table above. Anything that failed goes to `docs/STATUS.md` as a next task.
