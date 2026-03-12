export { Device } from "./device";
export { type UINode, type ElementMatcher } from "./element";

export async function connect(serial?: string) {
	const { Device } = await import("./device");
	return Device.connect(serial);
}
