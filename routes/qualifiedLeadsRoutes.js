import express from 'express';
import { 
    createQualifiedLead, 
    deleteQualifiedLead, 
    getQualifiedLeadById, 
    getQualifiedLeads, 
    updateQualifiedLead,
    updateCallStatus,
    updateMessageStatus,
    getQualifiedLeadStats
} from '../controller/qualifiedLeadsController.js';


const qualifiedLeadsRouter = express.Router();

qualifiedLeadsRouter.post('/create', createQualifiedLead);
qualifiedLeadsRouter.get('/get/:userId', getQualifiedLeads);
qualifiedLeadsRouter.get('/get-by-id/:id', getQualifiedLeadById);
qualifiedLeadsRouter.get('/stats/:id', getQualifiedLeadStats);
qualifiedLeadsRouter.put('/update/:id', updateQualifiedLead);
qualifiedLeadsRouter.put('/update-call-status', updateCallStatus);
qualifiedLeadsRouter.put('/update-message-status', updateMessageStatus);
qualifiedLeadsRouter.delete('/delete/:id', deleteQualifiedLead);


export default qualifiedLeadsRouter;
