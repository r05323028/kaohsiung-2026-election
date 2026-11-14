/**
 * Wording heuristics shared by the build and the validator.
 *
 * They are only a triage aid: any record they flag needs a reviewed decision in
 * data/policy-career/2026/curation.json, and no record is ever moved between the
 * Policy and Career tabs on the strength of a regex alone.
 */

/** Wording that reads as an outcome already delivered. */
export const COMPLETION_MARKERS =
  /已經|已於|已獲|已通過|已核定|成功爭取|促成|完成|完工|啟用|開幕|上路|核准|核定|提高至|調高至|增至|自\d+年|去年|前年|上任|任期內|爭取到|獲得|通過了/;

/** Wording that reads as a plan, request, or promise. */
export const FUTURE_MARKERS =
  /將|預計|規劃|爭取|推動|要求|呼籲|建議|承諾|目標|未來|希望|促請|建請|打造|研議|評估|期盼|主張|力促|盼|應|須|需要|持續|定期|優先|擴大|增設|改善|檢討|落實|保障|提高|調降|補助|設置|建立|催生|加速|完善|強化|輔導|培訓|公開|透明/;

/** True when a description reads as something done and offers no future tense. */
export function readsAsCompletedAction(text: string): boolean {
  return COMPLETION_MARKERS.test(text) && !FUTURE_MARKERS.test(text);
}
