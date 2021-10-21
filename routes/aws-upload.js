const express = require('express');
const router = express.Router();
const awsS3Client = require('../aws-s3-client');

router.get('/', function(req, res, next) {
    if (!req.query.command || !awsS3Client.hasOwnProperty(req.query.command)) {
      res.status(404).end('Invalid command type');
      return;
    }
    awsS3Client[req.query.command](req, res);
});

router.post('/CompleteMultipartUpload', function(req, res, next) {
    awsS3Client.CompleteMultipartUpload(req, res);
});

module.exports = router;
