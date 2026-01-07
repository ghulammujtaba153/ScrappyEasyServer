import mongoose from 'mongoose';

const teamSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    },
    members: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },
});

const Team = mongoose.model('Team', teamSchema);

export default Team;
    