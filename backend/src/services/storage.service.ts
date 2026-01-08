import AWS from "aws-sdk";

type UploadedFile = { buffer: Buffer; originalname: string; mimetype: string };

const hasS3 = !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY && !!process.env.AWS_S3_BUCKET;

const s3 = hasS3
  ? new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      region: process.env.AWS_REGION || "us-east-1",
    })
  : null;

export async function uploadFilesToS3(files: UploadedFile[], folder: string): Promise<string[]> {
  if (!files || files.length === 0) return [];
  if (!s3) return [];

  const bucket = process.env.AWS_S3_BUCKET!;
  const region = process.env.AWS_REGION || "us-east-1";

  const urls: string[] = [];
  for (const file of files) {
    const key = `${folder}/${Date.now()}-${file.originalname}`;
    await s3
      .putObject({
        Bucket: bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      })
      .promise();

    urls.push(`https://${bucket}.s3.${region}.amazonaws.com/${key}`);
  }

  return urls;
}


