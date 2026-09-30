// Self-hosted fonts for every CarePulse frontend — import once from each
// app's __root.tsx. The --font-sans/--font-mono tokens in styles.css name them.
import "@fontsource-variable/dm-sans";
// Weight must be listed explicitly — Space Mono only ships 400/700, it has no
// variable-weight axis.
import "@fontsource/space-mono/400.css";
import "@fontsource/space-mono/700.css";
