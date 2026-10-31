const express = require('express');
const path = require('path');
const { adminAuth } = require('../middleware/auth');
const upload = require('../middleware/upload');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.post(
  '/',
  adminAuth,
  upload.array('images', 10),
  asyncHandler(async (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const files = (req.files || []).map((file) => `${baseUrl}/uploads/${file.filename}`);

    if (files.length === 0) {
      return res.status(400).json({ message: 'No images uploaded.', code: 'NO_FILES' });
    }

    res.status(201).json({ message: 'Images uploaded successfully.', urls: files });
  })
);

module.exports = router;
