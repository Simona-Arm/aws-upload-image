var express = require('express');
var router = express.Router();
const s3Client = require('../aws-s3-client');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

router.get('/upload', function(req, res, next) {
  
});

module.exports = router;
