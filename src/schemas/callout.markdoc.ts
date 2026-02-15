import { type Schema, Tag } from '@markdoc/markdoc'

const callout: Schema = {
	render: 'module-callout',
	children: ['paragraph', 'tag', 'list'],
	attributes: {
		type: {
			type: String,
			default: 'note',
			matches: ['note', 'warning', 'caution', 'tip'],
			errorLevel: 'critical',
		},
		title: {
			type: String,
		},
	},
	transform(node, config) {
		const attributes = node.transformAttributes(config)
		const children = node.transformChildren(config)

		return new Tag('module-callout', attributes, children)
	},
}

export default callout
