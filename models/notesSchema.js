import mongoose from "mongoose"

const NotesSchema = new mongoose.Schema({
    dataId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Data"
    },
    content: {
        type: String,
    },
    title: {
        type: String,
    },
    isPinned: {
        type: Boolean,
        default: false
    },
    color: {
        type: String,
        default: "#ffffff"
    }
}, {
    timestamps: true
})

const Notes = mongoose.model("Notes", NotesSchema);

export default Notes;