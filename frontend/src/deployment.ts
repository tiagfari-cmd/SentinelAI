// Explicit public mode: fictional sample or a visitor's browser-only file analysis.
// No URL parameter or visitor-supplied token can enable the backend in this mode.
export const isPublicDemo = import.meta.env.MODE === 'demo'
// Prepared, not activated. Public Gemini needs separate owner approval and terms review.
export const publicGeminiEnabled = import.meta.env.VITE_PUBLIC_GEMINI_ENABLED === 'true'
