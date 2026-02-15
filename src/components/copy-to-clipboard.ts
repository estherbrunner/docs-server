import { on } from '@zeix/le-truc'

export interface CopyMessages {
	success: string
	error: string
}

/**
 * Effect that copies text content from a source element to the clipboard
 * when the target element's button is clicked.
 */
export const copyToClipboard = (
	source: HTMLElement,
	messages: CopyMessages,
) =>
	on('click', async (e: Event) => {
		const text = source.textContent ?? ''
		const button = (e.currentTarget as HTMLElement).querySelector('button')
		const label = button?.querySelector('.label')
		if (!label) return

		const original = label.textContent ?? ''
		try {
			await navigator.clipboard.writeText(text)
			label.textContent = messages.success
		} catch {
			label.textContent = messages.error
		}

		setTimeout(() => {
			label.textContent = original
		}, 2000)
	})
