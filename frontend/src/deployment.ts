// Only this explicit build mode produces the public, browser-only demo.
// No URL parameter or visitor-supplied token can enable the backend in this mode.
export const isPublicDemo = import.meta.env.MODE === 'demo'
