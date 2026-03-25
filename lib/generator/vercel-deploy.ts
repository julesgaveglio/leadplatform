import slugify from 'slugify'

interface DeployFile {
  path: string
  content: string
}

interface DeployResult {
  url: string
  deploymentId: string
}

export async function deployToVercel(companyName: string, files: DeployFile[]): Promise<DeployResult> {
  const slug = slugify(companyName, { lower: true, strict: true })
  const projectName = `demo-${slug}`

  const vercelFiles = files.map(file => ({
    file: file.path,
    data: Buffer.from(file.content).toString('base64'),
    encoding: 'base64' as const,
  }))

  const response = await fetch('https://api.vercel.com/v13/deployments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: projectName,
      files: vercelFiles,
      projectSettings: {
        framework: 'nextjs',
        buildCommand: 'next build',
        outputDirectory: '.next',
      },
    }),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(`Vercel deploy failed: ${errorData.error?.message ?? response.statusText}`)
  }

  const data = await response.json()

  return {
    url: `https://${data.url}`,
    deploymentId: data.id,
  }
}
