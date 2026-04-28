const mongoose = require('mongoose');

const QuizAnswerSchema = new mongoose.Schema({
  question: String,
  options: [String],
  correctAnswer: Number,
  userAnswer: { type: Number, default: null }
}, { _id: false });

const QuizResultSchema = new mongoose.Schema({
  participantID: String,
  systemID: { type: Number, default: null },
  interactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Interaction' },
  questions: [QuizAnswerSchema],
  score: { type: Number, default: null },
  totalQuestions: { type: Number, default: 0 },
  status: { type: String, enum: ['generated', 'submitted'], default: 'generated' },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('QuizResult', QuizResultSchema);
