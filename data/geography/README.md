# Kaohsiung administrative geography

- Source: 內政部國土測繪中心, 鄉(鎮、市、區)界線(TWD97經緯度), TOWN_MOI_1140318, via https://data.gov.tw/dataset/7441.
- License: 政府資料開放授權條款第1版 (https://data.gov.tw/license).
- Snapshot: modified 2025-12-16, retrieved 2026-11-08.
- Generated display geometry: src/data/geography/kaohsiung-districts.json.
- Rebuild: PYTHONPATH=/tmp/kaohsiung-pylibs python3 scripts/build-kaohsiung-geography.py (requires pyshp; the committed JSON is used by the app).
- Simplification: RDP epsilon 0.0002 degrees (~22 m). Boundaries are for interactive display only, not surveying or legal eligibility.
- Qijin remote islands (Dongsha/Pratas and Taiping) are retained as explicit remote territory records and excluded from the main citywide camera bounds.
