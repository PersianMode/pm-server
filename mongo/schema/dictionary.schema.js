const Schema = require('mongoose').Schema;


let schema_obj = {
  type: {
    type: String,
    required: true,
    trim: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  value: {
    type: String,
    required: true,
    trim: true,
  },
};


let colorSchema = new Schema(schema_obj, {collection: 'dictionary', strict: true});
colorSchema.index({ type: 1, name: 1}, { unique: true });

module.exports = colorSchema;
