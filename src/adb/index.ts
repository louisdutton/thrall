export { Device } from "./device";
export type { ElementMatcher, UINode } from "./element";

export async function connect(serial?: string) {
	const { Device } = await import("./device");
	return Device.connect(serial);
}
