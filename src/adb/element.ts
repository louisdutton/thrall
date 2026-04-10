export interface UINode {
	tag: string;
	text: string;
	resourceId: string;
	contentDesc: string;
	className: string;
	bounds: { x1: number; y1: number; x2: number; y2: number };
	checked: boolean;
	enabled: boolean;
	focused: boolean;
	children: UINode[];
	center(): { x: number; y: number };
}

export type ElementMatcher = {
	text?: string;
	id?: string;
	contentDesc?: string;
	className?: string;
	exact?: boolean;
};

export function parseBounds(boundsStr: string): {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
} {
	const match = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
	if (!match) return { x1: 0, y1: 0, x2: 0, y2: 0 };
	return {
		x1: parseInt(match[1]),
		y1: parseInt(match[2]),
		x2: parseInt(match[3]),
		y2: parseInt(match[4]),
	};
}

function getAttr(tag: string, name: string): string {
	const match = tag.match(new RegExp(`${name}="([^"]*)"`));
	return match ? match[1] : "";
}

function getBoolAttr(tag: string, name: string): boolean {
	return getAttr(tag, name) === "true";
}

function makeNode(tag: string): UINode {
	const bounds = parseBounds(getAttr(tag, "bounds"));
	return {
		tag: tag.match(/<(\S+)/)?.[1] ?? "node",
		text: getAttr(tag, "text"),
		resourceId: getAttr(tag, "resource-id"),
		contentDesc: getAttr(tag, "content-desc"),
		className: getAttr(tag, "class"),
		bounds,
		checked: getBoolAttr(tag, "checked"),
		enabled: getBoolAttr(tag, "enabled"),
		focused: getBoolAttr(tag, "focused"),
		children: [],
		center() {
			return {
				x: Math.round((bounds.x1 + bounds.x2) / 2),
				y: Math.round((bounds.y1 + bounds.y2) / 2),
			};
		},
	};
}

export function parseHierarchy(xml: string): UINode[] {
	const roots: UINode[] = [];
	const stack: UINode[] = [];

	// Match opening tags (self-closing or not) and closing tags
	const tagRegex = /<(\/?)([\w.]+)([^>]*?)(\/?)>/g;
	let match: RegExpExecArray | null;

	while ((match = tagRegex.exec(xml)) !== null) {
		const [fullMatch, isClosing, , attrs, isSelfClosing] = match;

		if (isClosing) {
			// Closing tag — pop stack
			stack.pop();
		} else {
			const node = makeNode(fullMatch);
			if (stack.length > 0) {
				stack[stack.length - 1].children.push(node);
			} else {
				roots.push(node);
			}
			if (!isSelfClosing) {
				stack.push(node);
			}
		}
	}

	return roots;
}

function matches(node: UINode, matcher: ElementMatcher): boolean {
	const exact = matcher.exact ?? false;

	if (matcher.text !== undefined) {
		if (exact ? node.text !== matcher.text : !node.text.includes(matcher.text))
			return false;
	}
	if (matcher.id !== undefined) {
		if (
			exact
				? node.resourceId !== matcher.id
				: !node.resourceId.includes(matcher.id)
		)
			return false;
	}
	if (matcher.contentDesc !== undefined) {
		if (
			exact
				? node.contentDesc !== matcher.contentDesc
				: !node.contentDesc.includes(matcher.contentDesc)
		)
			return false;
	}
	if (matcher.className !== undefined) {
		if (
			exact
				? node.className !== matcher.className
				: !node.className.includes(matcher.className)
		)
			return false;
	}
	return true;
}

export function findMatch(
	nodes: UINode[],
	matcher: ElementMatcher,
): UINode | null {
	for (const node of nodes) {
		if (matches(node, matcher)) return node;
		const found = findMatch(node.children, matcher);
		if (found) return found;
	}
	return null;
}

export function findAllMatches(
	nodes: UINode[],
	matcher: ElementMatcher,
): UINode[] {
	const results: UINode[] = [];
	for (const node of nodes) {
		if (matches(node, matcher)) results.push(node);
		results.push(...findAllMatches(node.children, matcher));
	}
	return results;
}
