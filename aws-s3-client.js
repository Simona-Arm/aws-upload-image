const config = require('./config');
const aws = require('aws-sdk');

const s3 = new aws.S3({
    accessKeyId: config.AWS_ACCESS_KEY_ID,
    secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
    region: config.AWS_REGION
});

const createMultipartUpload = async (req, res) => {
    try {
        const params = {
            Bucket: config.AWS_BUCKET_NAME,
            Key: req.query.fileName,
            ContentType: req.query.contentType
        };
        const data = await s3.createMultipartUpload(params).promise();
        res.json({
            uploadId: data.UploadId,
            key: data.Key
        });     
    }
    catch(err) {
        res.status(404).end();
    }
}

const signUploadPart = async (req, res) => {
    try {
        const params = {
            Bucket: config.AWS_BUCKET_NAME,
            Key: req.query.key,
            UploadId: req.query.uploadId,
            PartNumber: req.query.partNumber,
            Expires: 60 * 60
        };
        const url = s3.getSignedUrl('uploadPart', params);
        res.json({url, partNumber: req.query.partNumber});       
    }
    catch(err) {
        res.status(404).end();
    }
}

const completeMultipartUpload = async (req, res) => {
    try {
        const params = {
            Bucket: config.AWS_BUCKET_NAME,
            Key: req.body.key,
            UploadId: req.body.uploadId,
            MultipartUpload: {
				Parts: req.body.parts
			}
        };

        const data = await s3.completeMultipartUpload(params).promise();
        res.json({
            uploadId: data.UploadId,
            key: data.Key
        });
    }
    catch(err) {
        res.status(404).end();
    }
}

const abortMultipartUpload = async (req, res) => {
    try {
        const model = s3.abortMultipartUpload({
            Bucket: config.AWS_BUCKET_NAME,
            Key: req.query.key,
            UploadId: req.query.uploadId
        });

        model.send((err, data) => {
            if (err) {
                res.status(404).end();
                return;
            }
            res.json({
                sucess: true
            });
        });   
    }
    catch(err) {
        res.status(404).end();
    }
}

module.exports = {
    CreateMultipartUpload: createMultipartUpload,
    SignUploadPart: signUploadPart,
    CompleteMultipartUpload: completeMultipartUpload,
    AbortMultipartUpload: abortMultipartUpload
}

//https://github.com/ienzam/s3-multipart-upload-browser/blob/master/server.php
//https://gist.github.com/sevastos/5804803