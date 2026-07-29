const mongoose = require('mongoose');

const duplicateFormSchema = new mongoose.Schema({
  originalFormId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Form', 
    required: true 
  },
  formData: { 
    type: Object, 
    required: true // Store all form data here
  },
  deletedAt: { 
    type: Date, 
    default: Date.now // Timestamp for when the form was deleted
  },
});

module.exports = mongoose.model('DuplicateForm', duplicateFormSchema);
