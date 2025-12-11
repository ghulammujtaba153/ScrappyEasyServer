import mongoose from "mongoose"

const NotesSchema = new mongoose.Schema({
    dataId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Data"
    },
    content: {
        type: String,
    }
}, {
    timestamps: true
})

const Notes = mongoose.model("Notes", NotesSchema);

export default Notes;