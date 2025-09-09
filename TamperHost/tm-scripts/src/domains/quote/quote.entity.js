// src/data/domains/quote/quote.entity.js
const num = (v, fallback = null) => v == null ? fallback : Number(v);

export const normalizeQuote = (raw = {}, prev = {}) => ({
    // preserve anything else we've stored (e.g., quoteHeaderGet)
    ...prev,

    // canonical fields
    Attachment_Count: num(raw?.Attachment_Count, prev?.Attachment_Count),
    Catalog_Key: raw?.Catalog_Key ?? prev?.Catalog_Key ?? null,
    Catalog_Code: raw?.Catalog_Code ?? prev?.Catalog_Code ?? null,
    Customer_Code: raw?.Customer_Code ?? prev?.Customer_Code ?? null,
    Customer_Name: raw?.Customer_Name ?? prev?.Customer_Name ?? null,
    Customer_No: raw?.Customer_No ?? prev?.Customer_No ?? null,
    Quote_Key: raw?.Quote_Key ?? prev?.Quote_Key ?? null,
    Quote_No: raw?.Quote_No ?? prev?.Quote_No ?? null,

    // timestamp in your PascalCase convention
    Updated_At: raw?.Updated_At ?? Date.now(),
});
