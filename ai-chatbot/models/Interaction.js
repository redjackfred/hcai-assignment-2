const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const RetrievedDocumentSchema = new mongoose.Schema({
    docName: { type: String },
    chunkIndex: { type: Number },
    chunkText: { type: String },
    relevanceScore: { type: Number }
}, { _id: false });

const ConfidenceMetricsSchema = new mongoose.Schema({
    overallConfidence: { type: Number },
    retrievalConfidence: { type: Number },
    responseConfidence: { type: Number, default: null },
    retrievalMethod: { type: String }
}, { _id: false });

const InteractionSchema = new Schema({
    participantID: String, // Unique identifier for the participant
    userInput: String, // Store the user's message
    botResponse: String, // Store the bot's response
    retrievalMethod: { type: String },
    retrievedDocuments: { type: [RetrievedDocumentSchema], default: [] },
    confidenceMetrics: { type: ConfidenceMetricsSchema, default: null },
    timestamp: { type: Date, default: Date.now } // Log the time of interaction
});
module.exports = mongoose.model('Interaction', InteractionSchema);