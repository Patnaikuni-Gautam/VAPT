const express = require('express');
const router = express.Router();
const { analyzeIAMPolicy } = require('../controllers/iamController');

router.post('/submit', analyzeIAMPolicy);

module.exports = router;