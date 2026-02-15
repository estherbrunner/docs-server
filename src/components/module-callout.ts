import { asString, defineComponent } from '@zeix/le-truc'

export type ModuleCalloutProps = {
	type: string
}

export default defineComponent<ModuleCalloutProps>(
	'module-callout',
	{
		type: asString('note'),
	},
	() => ({}),
	() => ({}),
)
