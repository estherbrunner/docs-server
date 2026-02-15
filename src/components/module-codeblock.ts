import {
	asBoolean,
	type Component,
	defineComponent,
	on,
	toggleAttribute,
} from '@zeix/le-truc'
import type { BasicButtonProps } from './basic-button.ts'
import { copyToClipboard } from './copy-to-clipboard.ts'

export type ModuleCodeblockProps = {
	collapsed: boolean
}

type ModuleCodeblockUI = {
	code: HTMLElement
	overlay?: HTMLButtonElement
	copy?: Component<BasicButtonProps>
}

declare global {
	interface HTMLElementTagNameMap {
		'module-codeblock': Component<ModuleCodeblockProps>
	}
}

export default defineComponent<ModuleCodeblockProps, ModuleCodeblockUI>(
	'module-codeblock',
	{ collapsed: asBoolean() },
	({ first }) => ({
		code: first('code', 'Needed as source container to copy from.'),
		overlay: first('button.overlay'),
		copy: first('basic-button.copy'),
	}),
	({ host, code, copy }) => ({
		host: toggleAttribute('collapsed'),
		overlay: on('click', () => {
			host.collapsed = false
		}),
		copy: copyToClipboard(code, {
			success: copy?.getAttribute('copy-success') || 'Copied!',
			error: copy?.getAttribute('copy-error') || 'Error trying to copy to clipboard!',
		}),
	}),
)
