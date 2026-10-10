// The project does not pull in vite/client types, so declare the raw-asset import shape locally.
// It lets the docs test read README.md through Vite instead of node:fs (no @types/node here).
declare module '*?raw' {
	const content: string;
	export default content;
}
