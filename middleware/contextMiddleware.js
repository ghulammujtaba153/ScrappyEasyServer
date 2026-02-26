import Team from '../models/teamSchema.js';

export const resolveTeamContext = async (req, res, next) => {
    try {
        // Look for x-active-team header
        const teamId = req.headers['x-active-team'];
        
        if (!teamId) {
            // No team context provided, effective user is the authenticated user
            req.effectiveUserId = req.userId;
            return next();
        }

        // Validate team
        const team = await Team.findById(teamId);
        if (!team) {
            return res.status(404).json({ success: false, message: 'Team not found' });
        }

        // Check if user is owner or member
        const isOwner = team.owner?.toString() === req.userId?.toString();
        const isMember = team.members?.some(m => m.user?.toString() === req.userId?.toString());

        if (!isOwner && !isMember) {
            return res.status(403).json({ success: false, message: 'Not authorized for this team' });
        }

        // User is authorized, set effective user to the team owner's ID
        req.effectiveUserId = team.owner?.toString() || req.userId;
        
        // Ensure POST bodies assign new data to the team owner
        if (req.body && req.body.userId) {
            req.body.userId = req.effectiveUserId;
        }

        next();
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error resolving team context: ' + error.message });
    }
};

export default resolveTeamContext;
