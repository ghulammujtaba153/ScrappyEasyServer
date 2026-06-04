import express from 'express';
import multer from 'multer';
import { authMiddleware as auth } from '../middleware/authMiddleware.js';
import * as ctrl from '../controller/contactController.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/',           auth, ctrl.getContacts);
router.post('/',          auth, ctrl.createContact);
router.post('/import',    auth, upload.single('file'), ctrl.importCsv);
router.delete('/:id',     auth, ctrl.deleteContact);

export default router;
