/**
 * Created by Eabasir on 30/02/2018.
 */
const Base = require('./base.model');
const error = require('./errors.list');
const mongoose = require('mongoose');
const models = require('../mongo/models.mongo');
const ProductModel = require('./product.model');

class Collection extends Base {

  constructor(test = Collection.test) {

    super('Collection', test);

    this.CollectionModel = this.model;
  }

  getCollection(collectionId) {

    if (!mongoose.Types.ObjectId.isValid(collectionId))
      return Promise.reject(error.collectionIdIsNotValid);

    return this.CollectionModel.findOne({_id: collectionId}).select('name name_fa')
  }

  setCollection(body, id) {
    if (!body.name || !body.name_fa)
      return Promise.reject(error.CollectionNameRequired);


    if (!id) {
      let newCollection = new this.CollectionModel({
        name: body.name,
        name_fa: body.name_fa
      });
      return newCollection.save();
    } else {
      return this.CollectionModel.findOneAndUpdate({
          '_id': mongoose.Types.ObjectId(id),
        },
        {
          $set: {
            'name': body.name,
            'name_fa': body.name_fa,
          }
        }, {new: true});
    }
  }

  deleteCollection(cid) {
    if (!mongoose.Types.ObjectId.isValid(cid)) return Promise.reject(error.collectionIdIsNotValid);
    return this.CollectionModel.findByIdAndRemove(cid);
  }

  getProductsByPageAddress(address) {
    if (!address) return Promise.reject(error.pageAddressRequired);
    return models()['Page' + (Collection.test ? 'Test' : '')].findOne({address}).lean()
      .then(res => {

        if (!res)
          return Promise.reject(error.pageNotFound);

        if (res && res.page_info && res.page_info.collection_id) {
          if (res.is_app)
            return this.getProducts(res.page_info.collection_id);
          else
            return Promise.reject(error.appOnly);

        } else {
          return Promise.reject(error.pageInfoError);
        }
      })
  }

  getCollectionProducts(collectionId) {

    if (!mongoose.Types.ObjectId.isValid(collectionId))
      return Promise.reject(error.collectionIdIsNotValid);

    return this.getProducts(collectionId);
  }

  /**
   * this function is used just for admin panel when admin wants to see
   * products of collection which he/she added by product id.
   * @param collectionId
   */
  getCollectionManualProducts(collectionId) {
    if (!mongoose.Types.ObjectId.isValid(collectionId))
      return Promise.reject(error.collectionIdIsNotValid);

    return this.getProducts(collectionId, true);
  }

  /**
   * @param collectionId
   * @param manualProducts: (default is false) is used when admin wants to get only products of collection which are added by product id
   *
   */
  async getProducts(collectionId, manualProducts = false) {
    try {
      let collectionName, collectionNameFa;
      let products = [];
      let types = [];
      let tags = [];
      let brands = [];
      let getProducts = [];

      let collection = await this.CollectionModel.aggregate([
        {
          $match: {
            _id: mongoose.Types.ObjectId(collectionId),
          }
        },
        {
          $unwind: {
            path: '$tagIds',
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $lookup: {
            from: 'tag',
            localField: 'tagIds',
            foreignField: '_id',
            as: 'tag'
          }
        },
        {
          $unwind: {
            path: '$tag',
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $group: {
            _id: '$_id',
            tags: {
              $push: {
                _id: '$tag._id',
                name: '$tag.name',
              }
            },
            typeIds: {$first: '$typeIds'},
            brandIds: {$first: '$brandIds'},
            productIds: {$first: '$productIds'},
            name: {$first: '$name'},
            name_fa: {$first: '$name_fa'},
          }
        },
        {
          $unwind: {
            path: '$typeIds',
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $lookup: {
            from: 'product_type',
            localField: 'typeIds',
            foreignField: '_id',
            as: 'types'
          }
        },
        {
          $unwind: {
            path: '$types',
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $group: {
            _id: '$_id',
            tags: {$first: '$tags'},
            types: {
              $push: {
                _id: '$types._id',
                name: '$types.name'
              }
            },
            brandIds: {$first: '$brandIds'},
            productIds: {$first: '$productIds'},
            name: {$first: '$name'},
            name_fa: {$first: '$name_fa'},
          }
        },
        {
          $unwind: {
            path: '$brandIds',
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $lookup: {
            from: 'brand',
            localField: 'brandIds',
            foreignField: '_id',
            as: 'brands'
          }
        },
        {
          $unwind: {
            path: '$brands',
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $group: {
            _id: '$_id',
            tags: {$first: '$tags'},
            types: {$first: '$types'},
            brands: {
              $push: {
                _id: '$brands._id',
              }
            },
            productIds: {$first: '$productIds'},
            name: {$first: '$name'},
            name_fa: {$first: '$name_fa'},
          }
        },
        {
          $unwind: {
            path: '$productIds',
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $lookup: {
            from: 'product',
            localField: 'productIds',
            foreignField: '_id',
            as: 'products'
          }
        },
        {
          $unwind: {
            path: '$products',
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $group: {
            _id: '$_id',
            tags: {$first: '$tags'},
            types: {$first: '$types'},
            brands: {$first: '$brands'},
            name: {$first: '$name'},
            name_fa: {$first: '$name_fa'},
            products: {
              $push: {
                _id: '$products._id',
              }
            }
          }
        },
      ]);
      collection = collection[0];
      if (collection.products || collection.tags || collection.types) {
        collectionName = collection.name;
        collectionNameFa = collection.name_fa;

        if (collection.products && collection.products.length)
          products = collection.products;

        if (collection.types && collection.types.length && !manualProducts)
          types = collection.types;

        if (collection.tags && collection.tags.length && !manualProducts)
          tags = collection.tags;

        if (collection.brands && collection.brands.length && !manualProducts)
          brands = collection.brands;

        if (products.length === 0 && types.length === 0 && tags.length === 0)
          return Promise.resolve([]);

        getProducts = await (new ProductModel(Collection.test)).getProducts(products.map(p => p._id).filter(el => el), types.map(t => t._id).filter(el => el), tags.map(t => t._id).filter(el => el), brands.map(b => b._id).filter(el => el), manualProducts); // override sold out search
      }

      return Promise.resolve({
        _id: collectionId,
        name: collectionName,
        name_fa: collectionNameFa,
        product: products,
        types: types,
        tags: tags,
        brands: brands,
        products: getProducts
      })
    } catch (err) {
      throw err;
    }
  }

  setProductToCollection(cid, productId) {
    if (!mongoose.Types.ObjectId.isValid(cid)) return Promise.reject(error.collectionIdIsNotValid);
    if (!mongoose.Types.ObjectId.isValid(productId)) return Promise.reject(error.productIdIsNotValid);

    return this.CollectionModel.update({_id: cid}, {$addToSet: {'productIds': productId}})
      .then(res => {
        // Get campaign ids related to this collection
        return models()['Campaign' + (Collection.test ? 'Test' : '')].find({collection_ids: {$in: [cid]}});
      })
      .then(res => {
        return models()['Product' + (Collection.test ? 'Test' : '')].findOneAndUpdate({
          _id: productId,
        }, {
          $addToSet: {
            campaigns: res.map(el => el._id)
          }
        });
      })
      .then(res => Promise.resolve(res));
  }

  deleteProductFromCollection(cid, productId) {
    if (!mongoose.Types.ObjectId.isValid(cid)) return Promise.reject(error.collectionIdIsNotValid);
    if (!mongoose.Types.ObjectId.isValid(productId)) return Promise.reject(error.productIdIsNotValid);

    return this.CollectionModel.update({_id: cid}, {$pull: {'productIds': productId}})
      .then(res => {
        // Get campaign ids related to this collection
        return models()['Campaign' + (Collection.test ? 'Test' : '')].find({collection_ids: {$in: [cid]}});
      })
      .then(res => {
        return models()['Product' + (Collection.test ? 'Test' : '')].update({
          _id: productId,
        }, {
          $pull: {
            campaigns: {$in: res.map(el => el._id)}
          }
        });
      })
      .then(res => Promise.resolve(res));
  }

  getCollectionTags(collectionId) {
    if (!mongoose.Types.ObjectId.isValid(collectionId))
      return Promise.reject(error.collectionIdIsNotValid);

    return this.CollectionModel.aggregate([
      {
        $match: {
          _id: mongoose.Types.ObjectId(collectionId),
          'tagIds': {$exists: true, $not: {$size: 0}}
        }
      },
      {
        $lookup: {
          from: 'tag',
          localField: 'tagIds',
          foreignField: '_id',
          as: 'tag'
        }
      },
      {
        $unwind: {
          path: '$tag',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $lookup: {
          from: 'tag_group',
          localField: 'tag.tag_group_id',
          foreignField: '_id',
          as: 'tag_group'
        }
      },
      {
        $unwind: {
          path: '$tag_group',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $group: {
          _id: '$_id',
          tags: {
            $push: {
              _id: '$tag._id',
              name: '$tag.name',
              tg_name: '$tag_group.name'
            }
          }

        }
      }
    ])
      .then(res => {
        if (res && res.length > 0)
          return Promise.resolve(res[0]);
        else
          return Promise.resolve();
      })

  }

  setTagToCollection(cid, tagId) {
    if (!mongoose.Types.ObjectId.isValid(cid)) return Promise.reject(error.collectionIdIsNotValid);
    if (!mongoose.Types.ObjectId.isValid(tagId)) return Promise.reject(error.TagIdIsNotValid);

    return this.CollectionModel.update({_id: cid}, {$addToSet: {'tagIds': tagId}})
      .then(res => {
        return models()['Campaign' + (Collection.test ? 'Test' : '')].find({collection_ids: {$in: [cid]}});
      })
      .then(res => {
        return models()['Product' + (Collection.test ? 'Test' : '')].update({
          'tags.tag_id': {$in: [tagId]},
        }, {
          $addToSet: {
            campaigns: res.map(el => el._id)
          }
        }, {
          multi: true,
        });
      })
      .then(res => Promise.resolve(res));
  }

  deleteTagFromCollection(cid, tid) {
    if (!mongoose.Types.ObjectId.isValid(cid)) return Promise.reject(error.collectionIdIsNotValid);
    if (!mongoose.Types.ObjectId.isValid(tid)) return Promise.reject(error.tagIdIsNotValid);

    return this.CollectionModel.update({_id: cid}, {$pull: {'tagIds': tid}})
      .then(res => {
        return models()['Campaign' + (Collection.test ? 'Test' : '')].find({collection_ids: {$in: [cid]}});
      })
      .then(res => {
        return models()['Product' + (Collection.test ? 'Test' : '')].update({
          'tags.tag_id': {$in: [tid]},
        }, {
          $pull: {
            campaigns: {$in: res.map(el => el._id)}
          }
        }, {
          multi: true,
        });
      })
      .then(res => Promise.resolve(res));
  }

  getCollectionTypes(collectionId) {
    if (!mongoose.Types.ObjectId.isValid(collectionId))
      return Promise.reject(error.collectionIdIsNotValid);

    return this.CollectionModel.aggregate([
      {
        $match: {
          _id: mongoose.Types.ObjectId(collectionId),
          'typeIds': {$exists: true, $not: {$size: 0}}
        }
      },
      {
        $lookup: {
          from: 'product_type',
          localField: 'typeIds',
          foreignField: '_id',
          as: 'types'
        }
      },
      {
        $project: {
          'types': 1
        }
      }
    ]).then(res => {
      if (res && res.length > 0)
        return Promise.resolve(res[0]);
      else
        return Promise.resolve();
    })

  }

  getCollectionFilterOptionList(collectionId) {
    if (!mongoose.Types.ObjectId.isValid(collectionId))
      return Promise.reject(error.collectionIdIsNotValid);

    return this.CollectionModel.find({
      _id: mongoose.Types.ObjectId(collectionId)
    })
      .then(res => {
        if (res)
          return Promise.resolve(res[0].filter_options);
        else
          return Promise.reject();
      })
  }

  setTypeToCollection(cid, typeId) {
    if (!mongoose.Types.ObjectId.isValid(cid)) return Promise.reject(error.collectionIdIsNotValid);
    if (!mongoose.Types.ObjectId.isValid(typeId)) return Promise.reject(error.TagIdIsNotValid);

    return this.CollectionModel.update({_id: cid}, {$addToSet: {'typeIds': typeId}})
      .then(res => {
        return models()['Campaign' + (Collection.test ? 'Test' : '')].find({collection_ids: {$in: [cid]}});
      })
      .then(res => {
        return models()['Product' + (Collection.test ? 'Test' : '')].update({
          'product_type.product_type_id': {$in: [typeId]}
        }, {
          $addToSet: {
            campaigns: res.map(el => el._id)
          }
        }, {
          multi: true
        });
      })
      .then(res => Promise.resolve(res));
  }

  deleteTypeFromCollection(cid, tid) {
    if (!mongoose.Types.ObjectId.isValid(cid)) return Promise.reject(error.collectionIdIsNotValid);
    if (!mongoose.Types.ObjectId.isValid(tid)) return Promise.reject(error.typeIdIsNotValid);

    return this.CollectionModel.update({_id: cid}, {$pull: {'typeIds': tid}})
      .then(res => {
        return models()['Campaign' + (Collection.test ? 'Test' : '')].find({collection_ids: {$in: [cid]}});
      })
      .then(res => {
        return models()['Product' + (Collection.test ? 'Test' : '')].update({
          'product_type.product_type_id': {$in: [tid]}
        }, {
          $pull: {
            campaigns: {$in: res.map(el => el._id)}
          }
        }, {
          multi: true,
        });
      })
      .then(res => Promise.resolve(res));
  }


  setFilterOptionListToCollection(cid, optionList) {
    if (!mongoose.Types.ObjectId.isValid(cid)) return Promise.reject(error.collectionIdIsNotValid);

    return this.CollectionModel.update({_id: cid}, {$set: {'filter_options': optionList}})
      .then(res => {
        return Promise.resolve(res)
      });
  }

  search(options, offset, limit) {
    let result;
    let match = {
      $or: [{name: {$regex: options.phrase, $options: 'i'}}, {name_fa: {$regex: options.phrase, $options: 'i'}}]
    };
    if (options.is_smart === true || options.is_smart === false)
      match['is_smart'] = options.is_smart === true ? 'true' : 'false';
    return this.CollectionModel.find(match, {name: 1, name_fa: 1, is_smart: 1})
      .skip(offset)
      .limit(limit)
      .select({'name': 1, 'name_fa': 1}).then(res => {
        result = res;
        return this.CollectionModel.find({
          $or: [{
            name: {
              $regex: options.phrase,
              $options: 'i'
            }
          }, {name_fa: {$regex: options.phrase, $options: 'i'}}]
        }, {
          name: 1,
          name_fa: 1,
          is_smart: 1
        }).count();
      })
      .then(res => {
        return Promise.resolve({
          data: result,
          total: res,
        })
      })
  }

  getCollectionPages(body) {
    if (!body.collection_id) return Promise.reject(error.collectionIdIsNotValid);
    return models()['Page' + (Collection.test ? 'Test' : '')].find({
      "page_info.collection_id": body.collection_id
    })
      .then(res => {
        if (!res)
          return Promise.reject(error.pageNotFound);
        else {
          return Promise.resolve(res);
        }
      })
  }

  suggest(phrase) {
    return this.CollectionModel.find({name: {$regex: phrase, $options: 'i'}}, {name: 1})
      .limit(5).sort({name: 1});
  }
}

Collection.test = false;

module.exports = Collection;
