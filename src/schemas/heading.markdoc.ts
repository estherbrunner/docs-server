import Markdoc, { type Node, type Config, type Schema, Tag } from '@markdoc/markdoc'

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\w\s-]/g, '')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.trim()
}

function getTextContent(node: Node): string {
	if (node.type === 'text') return String(node.attributes.content ?? '')
	return node.children.map(getTextContent).join('')
}

const heading: Schema = {
	children: ['inline'],
	attributes: {
		...Markdoc.nodes.heading.attributes,
		id: { type: String },
	},
	transform(node: Node, config: Config) {
		const attributes = node.transformAttributes(config)
		const children = node.transformChildren(config)
		const text = getTextContent(node)
		const id = attributes.id || slugify(text)
		const level = node.attributes.level as number

		return new Tag(`h${level}`, { id }, children)
	},
}

export default heading
