const Schema = require('mongoose').Schema;

let schema_obj = {
  color_id: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: 'Color'
  },
  // images: [{
  //     type: String,
  //     trim: true,
  // }],
  image: {
    thumbnail: {type: String, trim: true},
    angles: [{type: String, trim: true}]
  }
};


let ProductColorSchema = new Schema(schema_obj, {collection: 'product_color', strict: true});

module.exports = ProductColorSchema;
