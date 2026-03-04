import { google } from 'googleapis'

type Props = { params: Promise<{ id: string }> }

async function getPost(id: number) {
  const auth = await google.auth.getClient({ scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
  const spreadsheets = google.sheets({ version: 'v4', auth })

  const range: string = `Sheet1!A${id}:B${id}`

  const response = await spreadsheets.spreadsheets.values.get({
    spreadsheetId: process.env.SHEET_ID,
    range,
  })

  const values = response.data.values
  const firstRow = Array.isArray(values) ? values[0] : undefined
  if (!firstRow || !Array.isArray(firstRow)) {
    return { title: 'Not Found', content: 'Not Found' }
  }

  const title = String(firstRow[0] ?? '')
  const content = String(firstRow[1] ?? '')
  if (!title || !content) return { title: 'Not Found', content: 'Not Found' }

  return { title, content }
}

export default async function PostPage({ params }: Props) {
  const { id } = await params

  // Validate that `id` is a positive integer (row number). If not, return 400.
  if (!/^\d+$/.test(id)) {
    throw new Response('Bad Request', { status: 400 })
  }

  const idNumber = parseInt(id, 10)
  const { title, content } = await getPost(idNumber)

  return (
    <article>
      <h1>{title}</h1>
      <div dangerouslySetInnerHTML={{ __html: content }} />
    </article>
  )
}
