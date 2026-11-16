# 藍圖

本文件只記錄尚未完成的工作與非目標；完成項目的歷史留在 Git 與 `openspec/changes/`。量測與稽核輸出只寫入 gitignored 的 `.cache/reports/`。

## 現況

- canonical roster、選區、候選人與來源驗證在 build 前離線執行。
- 基本資料、政策、新聞、從政歷程與家族關係使用受控 snapshots；沒有內部內容審查路由、佇列或自動發布引擎。
- 未驗證、來源不足、衝突與無法取得來源的資料維持 `pending-verification`／`withheld-unverified`，不會自動出現在公開頁面。
- GitHub Pull Request 是內容、證據與 provenance 的人工審查入口；CI 只執行 deterministic technical checks。

## 下一個里程碑

1. 取得正式公告快照，重跑官方名冊與號次對帳；只有來源已公告且驗證通過才升級 `numberStatus`。
2. 持續解決身分衝突與來源缺口；沒有交叉證據前，不發布依賴該身分的 claims。
3. 以 PR-reviewed snapshots 擴充履歷、公開紀錄與新聞，但保留 fail-closed unknowns 與中性缺口狀態。
4. 完成必要的無障礙、效能與視覺回歸證據；產出留在 `.cache/reports/`。

## 之後

- 以既有離線管線新增候選人與來源，不引入 runtime API、CMS 或自動發布未驗證文字。
- 持續改善角色 likeness 的授權、checksum、視覺品質與可及性流程。
- 擴充選舉區城市模型、效能預算、多語系與公共資料引用體驗。

## 非目標

排名、好感度、聲量或支持度分數；遊戲化經濟或成就；後端 CMS、認證或執行期搜尋 API；由模型自動生成政治主張；以機器查核或 AI 輔助冒充人類 PR review；完整城市模擬。

## 維護方式

保持一頁以內。完成項目直接刪除，不標記完成；新增里程碑前確認它不屬於既有資料、內容、城市或開發文件的職責。PR 政策與 required checks 以 `.github/` 與 [DEVELOPMENT.md](DEVELOPMENT.md) 為準。
