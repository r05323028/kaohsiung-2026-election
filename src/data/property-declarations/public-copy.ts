import type {
  PropertyDeclarationFinancialCategory,
  PropertyDeclarationFinancialCategorySummary,
  PropertyDeclarationFinancialSummary,
  PropertyDeclarationFinancialSummarySources,
} from './schema';

type PublicPropertyDeclarationCategorySummary = Omit<
  PropertyDeclarationFinancialCategorySummary,
  'verificationStatus' | 'verificationMethod' | 'sourceConflict'
>;

export type PropertyDeclarationPublicSource =
  PropertyDeclarationFinancialSummarySources;

export type PropertyDeclarationPublicFinancialSummary = Omit<
  PropertyDeclarationFinancialSummary,
  'categories'
> & {
  categories: PublicPropertyDeclarationCategorySummary[];
};

export const PROPERTY_DECLARATION_OFFICIAL_SOURCE_LABEL = '中選會官方財產申報';
export const PROPERTY_DECLARATION_GAZETTE_SOURCE_LABEL =
  '台灣前進《2026 民間版選舉公報》';

export const PROPERTY_DECLARATION_PUBLIC_NOTE =
  '本頁呈現中選會公開文件連結與類別摘要。官方文件可安全判讀的欄位優先採用；官方欄位無法判讀或未發布時，才以可對帳的《2026 民間版選舉公報》資料補足，並逐項標示來源。民間來源是該站公開整理的資料，不是官方文件。摘要只呈現有來源證據的類別總額或申報筆數，不是人工逐筆覆核；衝突、辨識不足或無法確定的欄位維持「未能確定」，不以空白推論為零。不轉錄地址、身分證字號、金融帳戶、簽名或個別財產標的。';

export const PROPERTY_DECLARATION_FINANCIAL_NOTE =
  '每個數值都標示來源。官方與民間來源不一致時保留官方已核對數值，不平均或改寫；兩邊都無法安全確定時維持「未能確定」，不以空白推論為零。';

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
