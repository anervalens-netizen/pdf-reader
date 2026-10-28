import notoSansUrl from '@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf?url&inline'

export interface FormValue {
  name: string
  type: string
  value: string | boolean
}

let fontPromise: Promise<Uint8Array> | null = null

/**
 * Fetch only when the user edits a form with characters outside ASCII.
 * Inline asset works in file:// Electron, Android WebView and offline PWAs;
 * the font never depends on an external server.
 */
export async function fontForFormValues(values: FormValue[]): Promise<Uint8Array | undefined> {
  if (!values.some((value) => typeof value.value === 'string' && /[^\u0000-\u007f]/u.test(value.value))) {
    return undefined
  }
  if (!fontPromise) {
    fontPromise = fetch(notoSansUrl).then(async (response) => {
      if (!response.ok) throw new Error('Nu se poate încărca fontul Unicode integrat.')
      return new Uint8Array(await response.arrayBuffer())
    }).catch((error) => {
      fontPromise = null
      throw error
    })
  }
  return fontPromise
}
