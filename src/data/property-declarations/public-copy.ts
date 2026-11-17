import type {
  PropertyDeclarationFinancialCategory,
  PropertyDeclarationFinancialCategorySummary,
  PropertyDeclarationFinancialSummary,
} from './schema';

type PublicPropertyDeclarationCategorySummary = Omit<
  PropertyDeclarationFinancialCategorySummary,
  'verificationStatus' | 'verificationMethod'
>;

export type PropertyDeclarationPublicFinancialSummary = Omit<
  PropertyDeclarationFinancialSummary,
  'categories'
> & {
  categories: PublicPropertyDeclarationCategorySummary[];
};

export const PROPERTY_DECLARATION_PUBLIC_NOTE =
  '本頁僅呈現中選會財產申報公開查閱平台的官方文件連結、來源對帳狀態，以及經兩次不同渲染倍率離線 OCR 結果比對、並以官方文件頁碼定位的類別摘要；這不是人工逐筆覆核。不轉錄地址、身分證字號、金融帳戶、簽名或個別財產標的。';

export const PROPERTY_DECLARATION_FINANCIAL_NOTE =
  '類別摘要只保留兩次不同渲染倍率離線 OCR 結果一致、且有官方文件頁碼證據的總額或申報筆數；衝突、辨識不足或無法安全確定的欄位維持「未能確定」，不以空白推論為零。';

export const PROPERTY_DECLARATION_FINANCIAL_CATEGORY_LABELS: Record<
  PropertyDeclarationFinancialCategory,
  string
> = {
  land: '土地',
  building: '建物',
  ship: '船舶',
  vehicles: '汽車',
  aircraft: '航空器',
  cash: '現金',
  deposits: '存款',
  securities: '有價證券',
  'valuable-property': '具有相當價值之財產',
  insurance: '保險',
  'virtual-assets': '虛擬資產',
  claims: '債權',
  debts: '債務',
  'business-investment': '事業投資',
};

export const PROPERTY_DECLARATION_FINANCIAL_CATEGORY_COUNT = Object.keys(
  PROPERTY_DECLARATION_FINANCIAL_CATEGORY_LABELS,
).length;
