export const config = {
  runtime: 'nodejs'
};

export default async function handler(req, res) {
  const key = process.env.ENCRYPTION_KEY;

  return res.json({
    hasKey: !!key,
    keyLength: key ? key.length : 0,
    keyPreview: key ? key.substring(0, 8) + '...' : 'undefined'
  });
}
