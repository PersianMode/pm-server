const rp = require('request-promise');
const lib = require('../../../lib/index');
const fs = require('fs');
const path = require('path');
const models = require('../../../mongo/models.mongo');
const mongoose = require('mongoose');
const errors = require('../../../lib/errors.list');
const moment = require('moment');

describe('Post page basics', () => {

  let basicPageId;
  let adminObj = {
    aid: null,
    jar: null,
  };

  beforeEach(done => {
    lib.dbHelpers.dropAll()
      .then(() => lib.dbHelpers.addAndLoginAgent('admin'))
      .then(res => {
        adminObj.aid = res.aid;
        adminObj.jar = res.rpJar;
        let basicPage = models()['PageTest']({
          address: 'sampleAddress',
          is_app: false,

        });
        return basicPage.save();
      })
      .then(res => {
        basicPageId = res._id;
        done();
      })
      .catch(err => {
        console.error(err);
        done();
      });
  });

  it('should update basic info of page', function (done) {

    this.done = done;
    let collectionId = new mongoose.Types.ObjectId();

    rp({
      method: 'post',
      uri: lib.helpers.apiTestURL(`page/${basicPageId}`),
      body: {
        address: 'changedAddress',
        is_app: true,
        collection_id: collectionId
      },
      jar: adminObj.jar,
      json: true,
      resolveWithFullResponse: true
    }).then(res => {
      expect(res.statusCode).toBe(200);
      return models()['PageTest'].find({}).lean();

    }).then(res => {
      expect(res[0].address).toBe('changedAddress');
      expect(res[0].is_app).toBe(true);
      expect(res[0].page_info.collection_id.toString()).toBe(collectionId.toString());
      done();

    })
      .catch(lib.helpers.errorHandler.bind(this));
  });
});

describe('Post page placements and page info', () => {
  let page, collection_id, archivePlacement1, archivePlacement2;
  const pageId = new mongoose.Types.ObjectId();
  let contentManager;

  const placementId1 = new mongoose.Types.ObjectId();
  const placementId2 = new mongoose.Types.ObjectId();
  const placementId3 = new mongoose.Types.ObjectId();
  const placementId4 = new mongoose.Types.ObjectId();
  const placementId5 = new mongoose.Types.ObjectId();
  const placementId6 = new mongoose.Types.ObjectId();
  const placementId7 = new mongoose.Types.ObjectId();
  const placementId8 = new mongoose.Types.ObjectId();
  const placementId9 = new mongoose.Types.ObjectId();

  beforeEach(done => {
    lib.dbHelpers.dropAll()
      .then(() => {
        return lib.dbHelpers.addAndLoginAgent('cm');
      })
      .then(res => {
        contentManager = res;

        collection_id = new mongoose.Types.ObjectId();

        page = models()['PageTest']({
          _id: pageId,
          address: 'test',
          is_app: false,
          placement: [
            {
              "_id": placementId1,
              "component_name": "main",
              "variable_name": "",
              "info": {
                "panel_type": "quarter",
                "imgUrl": `images/placements/test/${pageId}/${placementId1}`,
                "href": "#",
                "subTitle": {
                  "title": "کفش پیاده روی زنانه نایک، مدل پگاسوس",
                  "text": "کفش پیاده روی زنانه",
                  "color": "black",
                  "textColor": "gray"
                },
              },
              start_date: moment(new Date(2013, 10, 10)).format('YYYY-MM-DD'),
              is_finalized: true,
            },
            {
              "_id": placementId2,
              "component_name": "slider",
              "variable_name": "پس گرفتن جنس خریداری شده تا ۳۰ روز",
              "info": {
                "column": 1,
                "imgUrl": "assets/cliparts/return.png",
                "href": "#",
                "style": {
                  "imgWidth": 30,
                  "imgMarginLeft": 5
                }
              },
              start_date: moment(new Date()).format('YYYY-MM-DD'),
              is_finalized: true,
            },
            {
              "_id": placementId3,
              "component_name": "menu",
              "variable_name": "topMenu",
              "info": {
                "column": "0",
                "text": "مردانه",
                "section": "men",
                "href": "collection/men"
              },
              is_finalized: true,
              is_deleted: true,
              start_date: moment(new Date()).format('YYYY-MM-DD'),
            },
            {
              "_id": placementId4,
              "component_name": "slider",
              "variable_name": "ارسال رایگان در تهران و حومه",
              "info": {
                "column": 0,
                "imgUrl": "assets/cliparts/delivery.png",
                "href": "#"
              },
              is_finalized: false,
              start_date: moment(new Date()).format('YYYY-MM-DD'),
            },
            {
              "_id": placementId5,
              "component_name": "main",
              "variable_name": "",
              "info": {
                "panel_type": "quarter",
                "imgUrl": `images/placements/test/${pageId}/${placementId5}/q3.png`,
                "href": "#",
                "subTitle": {
                  "title": "کفش ورزشی زنانه نایک، سری نایک پلاس",
                  "text": "کفش ورزشی زنانه",
                  "color": "black",
                  "textColor": "gray"
                },
                "areas": []
              },
              start_date: moment(new Date()).format('YYYY-MM-DD'),
              is_finalized: false,
            },
            {
              "_id": placementId6,
              "component_name": "menu",
              "variable_name": "subMenu",
              "info": {
                "section": "men/header",
                "column": 1,
                "row": 1,
                "text": "تازه‌ها",
                "href": "collection/x"
              },
              start_date: moment(new Date()).format('YYYY-MM-DD'),
              is_finalized: true,
            },
            {
              "_id": placementId7,
              "component_name": "menu",
              "variable_name": "subMenu",
              "info": {
                "section": "men/header",
                "column": 1,
                "row": 2,
                "text": "پرفروش‌ها",
                "href": "#"
              },
              start_date: moment(new Date('2010', '10', '10')).format('YYYY-MM-DD'),
              is_finalized: false,
            },
          ],
          page_info: {
            collection_id: collection_id,
            content: 'sample content'
          }
        });

        return page.save();
      })
      .then(res => {
        archivePlacement1 = models()['ArchivePlacementTest']({
          _id: placementId8,
          page_id: pageId,
          component_name: "main",
          start_date: moment(new Date(2010, 10, 10)).format('YYYY-MM-DD'),
          end_date: moment(new Date(2013, 10, 10)).format('YYYY-MM-DD'),
          info: {
            "panel_type": "full",
            "imgUrl": `images/placements/test/${pageId}/${placementId1}`,
            "href": "#",
            "subTitle": {
              "title": "کفش پیاده روی زنانه نایک، مدل پگاسوس",
              "text": "کفش پیاده روی زنانه",
              "color": "black",
              "textColor": "gray"
            }
          }
        });

        return archivePlacement1.save();
      })
      .then(res => {
        archivePlacement2 = models()['ArchivePlacementTest']({
          _id: placementId9,
          page_id: pageId,
          component_name: "footer",
          variable_name: "site_link",
          start_date: moment(new Date(2009, 10, 10)).format('YYYY-MM-DD'),
          end_date: moment(new Date(2010, 10, 10)).format('YYYY-MM-DD'),
          info: {
            "is_header": true,
            "row": 1,
            "column": 1,
            "text": "خرید و دریافت",
            "href": "#"
          }
        });

        return archivePlacement2.save();
      })
      .then(res => {
        done();
      })
      .catch(err => {
        console.error(err);
        done();
      });
  });

  it('should get page placements and page info of a website page using its address', function (done) {
    this.done = done;

    rp({
      method: 'post',
      uri: lib.helpers.apiTestURL(`page`),
      body: {
        address: page.address
      },
      json: true,
      resolveWithFullResponse: true
    }).then(res => {
      expect(res.statusCode).toBe(200);
      let result = res.body;
      expect(result.placement.length).toBe(4);
      expect(result.placement.find(el => el._id.toString() === placementId3.toString()).is_deleted).toBeUndefined();
      expect(result.page_info.collection_id.toString()).toBe(collection_id.toString());
      expect(result.page_info.content).toBe('sample content');
      done();
    })
      .catch(lib.helpers.errorHandler.bind(this));
  });

  it("should get page placements and override not finalized placements (based on content manager request)", function (done) {
    this.done = done;
    rp({
      method: 'post',
      body: {
        address: page.address
      },
      json: true,
      uri: lib.helpers.apiTestURL('page/cm/preview'),
      jar: contentManager.rpJar,
      resolveWithFullResponse: true,
    })
      .then(res => {
        expect(res.statusCode).toBe(200);
        res = res.body;
        expect(res.placement.length).toBe(6);
        expect(res.placement.find(el => el._id.toString() === placementId7.toString()).info.text).toBe('پرفروش‌ها');
        done();
      })
      .catch(lib.helpers.errorHandler.bind(this));
  });

  it("should get placements for specific date", function (done) {
    this.done = done;
    rp({
      method: 'post',
      body: {
        address: page.address,
        date: new Date(2012, 1, 1),
      },
      json: true,
      uri: lib.helpers.apiTestURL('page/cm/preview'),
      jar: contentManager.rpJar,
      resolveWithFullResponse: true,
    })
      .then(res => {
        expect(res.statusCode).toBe(200);
        res = res.body;
        expect(res.placement.length).toBe(2);
        expect(res.placement.find(el => el._id.toString() === placementId7.toString()).info.text).toBe('پرفروش‌ها');
        expect(res.placement.find(el => el._id.toString() === placementId8.toString()).info.subTitle.title).toBe('کفش پیاده روی زنانه نایک، مدل پگاسوس');
        expect(res.placement.find(el => el._id.toString() === placementId9.toString())).toBeUndefined();
        done();
      })
      .catch(lib.helpers.errorHandler.bind(this));
  });

  it("should finalizing the placements", function (done) {
    this.done = done;
    rp({
      method: 'post',
      body: {
        page_id: page._id,
        is_finalized: true,
      },
      uri: lib.helpers.apiTestURL('placement/finalize'),
      json: true,
      jar: contentManager.rpJar,
      resolveWithFullResponse: true,
    })
      .then(res => {
        expect(res.statusCode).toBe(200);
        return models()['PageTest'].find({_id: page._id}).lean();
      })
      .then(res => {
        expect(res[0].placement.length).toBe(6);
        res = res[0].placement;
        expect(res.find(el => el._id.toString() === placementId7.toString()).info.text).toBe('پرفروش‌ها');
        expect(moment(res.find(el => el._id.toString() === placementId7.toString()).start_date).format('YYYY-MM-DD HH:MM')).toBe(moment(new Date()).format('YYYY-MM-DD HH:MM'));
        return models()['ArchivePlacementTest'].find({page_id: page._id}).lean();
      })
      .then(res => {
        expect(res.length).toBe(3);
        done();
      })
      .catch(lib.helpers.errorHandler.bind(this));
  });

  it("should finalized placements by default unless is_finalized property is set", function (done) {
    this.done = done;
    rp({
      method: 'post',
      body: {
        page_id: page._id,
      },
      uri: lib.helpers.apiTestURL('placement/finalize'),
      json: true,
      jar: contentManager.rpJar,
      resolveWithFullResponse: true,
    })
      .then(res => {
        expect(res.statusCode).toBe(200);
        return models()['PageTest'].find({_id: page._id}).lean();
      })
      .then(res => {
        expect(res[0].placement.length).toBe(6);
        res = res[0].placement;
        expect(res.find(el => el._id.toString() === placementId7.toString()).info.text).toBe('پرفروش‌ها');
        done();
      })
      .catch(lib.helpers.errorHandler.bind(this));
  });

  it("should remove non-finalized placement (revert changes)", function (done) {
    this.done = done;
    rp({
      method: 'post',
      body: {
        page_id: page._id,
        is_finalized: false,
      },
      uri: lib.helpers.apiTestURL('placement/finalize'),
      json: true,
      jar: contentManager.rpJar,
      resolveWithFullResponse: true,
    })
      .then(res => {
        expect(res.statusCode).toBe(200);
        return models()['PageTest'].find({_id: page._id}).lean();
      })
      .then(res => {
        expect(res[0].placement.length).toBe(4);
        res = res[0].placement;

        expect(res.find(el => el._id.toString() === placementId3.toString()).info.href).toBe('collection/men');
        expect(res.find(el => el._id.toString() === placementId3.toString().is_deleted)).toBeUndefined();
        expect(res.find(el => el._id.toString() === placementId7.toString())).toBeUndefined();
        expect(res.find(el => el._id.toString() === placementId1.toString()).info.subTitle.title).toBe('کفش پیاده روی زنانه نایک، مدل پگاسوس');
        done();
      })
      .catch(lib.helpers.errorHandler.bind(this));
  });

  it("should get error when page id is not passed", function (done) {
    rp({
      method: 'post',
      body: {
        is_finalized: false,
      },
      uri: lib.helpers.apiTestURL('placement/finalize'),
      json: true,
      jar: contentManager.rpJar,
      resolveWithFullResponse: true,
    })
      .then(res => {
        this.fail('Content manager can revert changes without defined page id');
        done();
      })
      .catch(err => {
        expect(err.statusCode).toBe(errors.pageIdRequired.status);
        expect(err.error).toBe(errors.pageIdRequired.message);
        done();
      });
  });

  it("should revert old placements", function (done) {
    this.done = done;
    rp({
      method: 'post',
      body: {
        placements: [placementId8],
        page_id: pageId,
      },
      uri: lib.helpers.apiTestURL('placement/revert'),
      json: true,
      jar: contentManager.rpJar,
      resolveWithFullResponse: true,
    })
      .then(res => {
        expect(res.statusCode).toBe(200);
        return models()['ArchivePlacementTest'].find().lean();
      })
      .then(res => {
        expect(res.length).toBe(2);
        return models()['PageTest'].find({_id: pageId}).lean();
      })
      .then(res => {
        res = res[0];
        expect(res.placement.length).toBe(8);
        expect(res.placement.find(el => el._id.toString() === placementId8.toString()).end_date).toBeUndefined();
        done();
      })
      .catch(lib.helpers.errorHandler.bind(this));
  });

  it("should ignore to revert placements without end_date", function (done) {
    this.done = done;
    rp({
      method: 'post',
      body: {
        placements: [placementId8, placementId1, placementId2],
        page_id: pageId,
      },
      uri: lib.helpers.apiTestURL('placement/revert'),
      json: true,
      jar: contentManager.rpJar,
      resolveWithFullResponse: true,
    })
      .then(res => {
        expect(res.statusCode).toBe(200);
        return models()['ArchivePlacementTest'].find().lean();
      })
      .then(res => {
        expect(res.length).toBe(2);
        return models()['PageTest'].find({_id: pageId}).lean();
      })
      .then(res => {
        res = res[0];
        expect(res.placement.length).toBe(8);
        expect(res.placement.find(el => el._id.toString() === placementId8.toString()).end_date).toBeUndefined();
        done();
      })
      .catch(lib.helpers.errorHandler.bind(this));
  });

  it("should get error when page_id is not passed in body", function (done) {
    rp({
      method: 'post',
      body: {
        placements: [archivePlacement1],
      },
      uri: lib.helpers.apiTestURL('placement/revert'),
      json: true,
      jar: contentManager.rpJar,
      resolveWithFullResponse: true,
    })
      .then(res => {
        this.fail('Content Manager can revert some placement items without specifing the page_id');
        done();
      })
      .catch(err => {
        expect(err.statusCode).toBe(errors.pageIdRequired.status);
        expect(err.error).toBe(errors.pageIdRequired.message);
        done();
      });
  });

  it("should get error when placements is not passed or is empty", function (done) {
    rp({
      method: 'post',
      body: {
        placements: [],
        page_id: pageId,
      },
      uri: lib.helpers.apiTestURL('placement/revert'),
      json: true,
      jar: contentManager.rpJar,
      resolveWithFullResponse: true,
    })
      .then(res => {
        this.fail('Content Manager can revert some placement items with empty placements array');
        done();
      })
      .catch(err => {
        expect(err.statusCode).toBe(errors.placementIdRequired.status);
        expect(err.error).toBe(errors.placementIdRequired.message);
        done();
      });
  });
});

describe('POST placement (top menu and some other placements)', () => {
  let page, collection_id, contentManager;
  const placementId1 = new mongoose.Types.ObjectId();
  const placementId2 = new mongoose.Types.ObjectId();
  const placementId3 = new mongoose.Types.ObjectId();
  const placementId4 = new mongoose.Types.ObjectId();
  const placementId5 = new mongoose.Types.ObjectId();
  const placementId6 = new mongoose.Types.ObjectId();
  const placementId7 = new mongoose.Types.ObjectId();
  const placementId8 = new mongoose.Types.ObjectId();
  const placementId9 = new mongoose.Types.ObjectId();
  const pageId = new mongoose.Types.ObjectId();

  beforeEach(done => {
    lib.dbHelpers.dropAll()
      .then(() => {
        return lib.dbHelpers.addAndLoginAgent('cm');
      })
      .then(res => {
        contentManager = res;

        collection_id = new mongoose.Types.ObjectId();

        page = models()['PageTest']({
          address: 'test',
          is_app: false,
          placement: [
            {
              "_id": placementId1,
              "component_name": "menu",
              "variable_name": "topMenu",
              "info": {
                "column": "0",
                "text": "مردانه",
                "section": "men",
                "href": "collection/men"
              },
              start_date: new Date(),
              is_finalized: true,
            },
            {
              "_id": placementId2,
              "component_name": "menu",
              "variable_name": "subMenu",
              "info": {
                "section": "men/header",
                "column": 1,
                "row": 1,
                "text": "تازه‌ها",
                "href": "collection/x"
              },
              start_date: new Date(),
              is_finalized: true,
            },
            {
              "_id": placementId3,
              "component_name": "slider",
              "variable_name": "پس گرفتن جنس خریداری شده تا ۳۰ روز",
              "start_date": "",
              "end_date": "",
              "info": {
                "column": 1,
                "imgUrl": "assets/cliparts/return.png",
                "href": "#",
                "style": {
                  "imgWidth": 30,
                  "imgMarginLeft": 5
                }
              },
              start_date: new Date(),
              is_finalized: false,
            },
            {
              "_id": placementId4,
              "component_name": "menu",
              "variable_name": "topMenu",
              "info": {
                "column": "1",
                "text": "زنانه",
                "section": "women",
                "href": "collection/women"
              },
              start_date: new Date(),
              is_finalized: false,
            },
            {
              "_id": placementId5,
              "component_name": "menu",
              "variable_name": "topMenu",
              "info": {
                "column": "2",
                "text": "دخترانه",
                "section": "girls",
                "href": "collection/girls"
              },
              start_date: new Date(),
              is_finalized: true,
            },
            {
              "_id": placementId6,
              "component_name": "menu",
              "variable_name": "topMenu",
              "info": {
                "column": "3",
                "text": "پسرانه",
                "section": "boys",
                "href": "collection/boys"
              },
              start_date: new Date(),
              is_finalized: false,
            },
            {
              "_id": placementId7,
              "component_name": "menu",
              "variable_name": "topMenu",
              "info": {
                "column": "0",
                "text": "مردانه",
                "section": "men",
                "href": "collection/men/list"
              },
              start_date: new Date(),
              is_finalized: false,
            },
            {
              "_id": placementId8,
              "component_name": "main",
              "info": {
                "panel_type": "full",
                "imgUrl": `/images/placement/test/${pageId}/${placementId8}/test1.jpeg`,
                "href": "#first",
                "areas": [
                  {
                    "pos": "left-center",
                    "title": "مجموعه ری‌اکت",
                    "text": "حرکت رو به جلو ...",
                    "titleColor": "#230ec4"
                  }
                ]
              },
              start_date: new Date(),
              "is_finalized": true
            },
            {
              "_id": placementId9,
              "component_name": "main",
              "info": {
                "panel_type": "full",
                "imgUrl": `images/placement/test/${pageId}/${placementId9}/test1.jpeg`,
                "href": "#second",
                "areas": [
                  {
                    "pos": "left-center",
                    "title": "مجموعه ری‌اکت",
                    "text": " ...",
                    "titleColor": "#230ec4"
                  }
                ]
              },
              start_date: new Date(),
              "is_finalized": false
            }
          ],
          page_info: {
            collection_id: collection_id,
            content: 'sample content'
          }
        });

        return page.save()

      })
      .then(res => {
        done();
      })
      .catch(err => {
        console.error(err);
        done();
      });
  });

  it("content manager should apply updated details to the top menu items (update placement)", function (done) {
    this.done = done;
    rp({
      method: 'post',
      body: {
        page_id: page._id,
        placements: [
          {
            "_id": placementId1,
            "info": {
              "column": "3",
              "text": "مردانه - جدید",
            }
          },
          {
            "_id": placementId4,
            "info": {
              "column": "1",
              "text": "زنانه",
              "href": "collection/women"
            }
          },
          {
            "_id": placementId5,
            "info": {
              "column": "0",
              "text": "دخترانه",
              "href": "collection/girls"
            }
          },
          {
            "_id": placementId6,
            "info": {
              "column": "2",
              "text": "پسرانه",
              "href": "collection/boys",
              "section": 'bad_boys',
            }
          }],
      },
      uri: lib.helpers.apiTestURL('placement'),
      json: true,
      jar: contentManager.rpJar,
      resolveWithFullResponse: true,
    })
      .then(res => {
        expect(res.statusCode).toBe(200);
        return models()['PageTest'].find({_id: page._id}).lean();
      })
      .then(res => {
        expect(res[0].placement.length).toBe(9);
        res = res[0].placement.filter(el => el.component_name === 'menu' && el.variable_name === 'topMenu');
        expect(res.length).toBe(5);
        expect(res.filter(el => el.info.href === 'collection/girls').length).toBe(1);
        expect(res.find(el => el.info.href === 'collection/girls' && el._id.toString() === placementId5.toString()).info.column).toBe(2);
        expect(res.find(el => el.info.href === 'collection/girls' && el._id.toString() === placementId5.toString()).is_finalized).toBe(true);
        expect(res.find(el => el.info.href === 'collection/girls' && el._id.toString() === placementId5.toString()).updated_info).toBeDefined();
        expect(res.find(el => el.info.href === 'collection/girls' && el._id.toString() === placementId5.toString()).updated_info.column).toBe(0);
        expect(res.filter(el => el.info.href === 'collection/boys').length).toBe(1);
        expect(res.find(el => el.info.href === 'collection/boys' && el._id.toString() === placementId6.toString()).info.column).toBe(2);
        expect(res.find(el => el.info.href === 'collection/boys' && el._id.toString() === placementId6.toString()).info.section).toBe('boys');
        expect(res.find(el => el.info.href === 'collection/boys' && el._id.toString() === placementId6.toString()).is_finalized).toBe(false);
        expect(res.filter(el => el.info.href === 'collection/women').length).toBe(1);
        expect(res.find(el => el.info.href === 'collection/women' && el._id.toString() === placementId4.toString()).info.column).toBe(1);
        expect(res.find(el => el.info.href === 'collection/women' && el._id.toString() === placementId4.toString()).is_finalized).toBe(false);
        expect(res.filter(el => el.info.href === 'collection/men').length).toBe(1);
        expect(res.find(el => el.info.href === 'collection/men' && el._id.toString() === placementId1.toString()).info.column).toBe(0);
        expect(res.find(el => el.info.href === 'collection/men' && el._id.toString() === placementId1.toString()).is_finalized).toBe(true);
        expect(res.find(el => el.info.href === 'collection/men' && el._id.toString() === placementId1.toString()).updated_info).toBeDefined();
        expect(res.find(el => el.info.href === 'collection/men' && el._id.toString() === placementId1.toString()).updated_info.column).toBe(3);
        done();
      })
      .catch(lib.helpers.errorHandler.bind(this));
  });

  it("should get error when no id is specified for placement (update placement)", function (done) {
    rp({
      method: 'post',
      body: {
        page_id: page._id,
        placements: [
          {
            "_id": placementId1,
            "component_name": "menu",
            "variable_name": "topMenu",
            "info": {
              "column": "3",
              "text": "مردانه - جدید",
              "href": "collection/men"
            }
          },
          {
            "component_name": "menu",
            "variable_name": "topMenu",
            "info": {
              "column": "1",
              "text": "زنانه",
              "href": "collection/women"
            }
          }
        ]
      },
      uri: lib.helpers.apiTestURL('placement'),
      jar: contentManager.rpJar,
      json: true,
      resolveWithFullResponse: true,
    })
      .then(res => {
        this.fail('Content manager can update without specifies placement id');
        done();
      })
      .catch(err => {
        expect(err.statusCode).toBe(errors.placementIdRequired.status);
        expect(err.error).toBe(errors.placementIdRequired.message);
        done();
      });
  });

  it("should get error when page is not is specified", function (done) {
    rp({
      method: 'post',
      body: {
        placements: [
          {
            "_id": placementId1,
            "component_name": "menu",
            "variable_name": "topMenu",
            "info": {
              "column": "3",
              "text": "مردانه - جدید",
              "href": "collection/men"
            }
          },
          {
            "_id": placementId2,
            "component_name": "menu",
            "variable_name": "topMenu",
            "info": {
              "column": "1",
              "text": "زنانه",
              "href": "collection/women"
            }
          }
        ]
      },
      json: true,
      jar: contentManager.rpJar,
      uri: lib.helpers.apiTestURL('placement'),
      resolveWithFullResponse: true,
    })
      .then(res => {
        this.fail("Content manager can delete a placement without specified page id");
        done();
      })
      .catch(err => {
        expect(err.statusCode).toBe(errors.pageIdRequired.status);
        expect(err.error).toBe(errors.pageIdRequired.message);
        done();
      });
  });

  it("content manager should delete finalized placement (delete placement)", function (done) {
    this.done = done;
    rp({
      method: 'post',
      body: {
        page_id: page._id,
        placement_id: placementId1,
      },
      json: true,
      jar: contentManager.rpJar,
      uri: lib.helpers.apiTestURL('placement/delete'),
      resolveWithFullResponse: true,
    })
      .then(res => {
        expect(res.statusCode).toBe(200);
        return models()['PageTest'].find({_id: page._id}).lean();
      })
      .then(res => {
        expect(res[0].placement.length).toBe(9);
        res = res[0].placement.filter(el => el.component_name === 'menu' && el.variable_name === 'topMenu');
        expect(res.length).toBe(5);
        expect(res.find(el => el.info.href === 'collection/men' && el._id.toString() === placementId1.toString()).info.column).toBe(0);
        expect(res.find(el => el.info.href === 'collection/men' && el._id.toString() === placementId1.toString()).is_finalized).toBe(true);
        expect(res.find(el => el.info.href === 'collection/men' && el._id.toString() === placementId1.toString()).is_deleted).toBe(true);
        expect(res.find(el => el.info.href === 'collection/men' && el._id.toString() === placementId1.toString()).updated_info).toBeNull();
        done();
      })
      .catch(lib.helpers.errorHandler.bind(this));
  });

  it("content manager should delete not finalized placement (delete placement)", function (done) {
    this.done = done;
    rp({
      method: 'post',
      body: {
        page_id: page._id,
        placement_id: placementId4,
      },
      json: true,
      jar: contentManager.rpJar,
      uri: lib.helpers.apiTestURL('placement/delete'),
      resolveWithFullResponse: true,
    })
      .then(res => {
        expect(res.statusCode).toBe(200);
        return models()['PageTest'].find({_id: page._id}).lean();
      })
      .then(res => {
        expect(res[0].placement.length).toBe(8);
        res = res[0].placement.filter(el => el.component_name === 'menu' && el.variable_name === 'topMenu');
        expect(res.length).toBe(4);
        expect(res.find(el => el.info.href === 'collection/women' && el._id.toString() === placementId4.toString())).toBeUndefined();
        done();
      })
      .catch(lib.helpers.errorHandler.bind(this));
  });

  it("Content manager should delete not finalized placement with image", function (done) {
    this.done = done;
    fs.mkdir(`${__dirname}/../../../public/images/placements/test/${pageId}/${placementId9}`, () => {
      fs.copyFile('spec/api/page/test1.jpeg', `public/images/placements/test/${pageId}/${placementId9}/test1.jpeg`, () => {
        rp({
          method: 'post',
          body: {
            page_id: page._id,
            placement_id: placementId9,
          },
          json: true,
          jar: contentManager.rpJar,
          uri: lib.helpers.apiTestURL('placement/delete'),
          resolveWithFullResponse: true,
        })
          .then(res => {
            expect(res.statusCode).toBe(200);
            return models()['PageTest'].find({_id: page._id}).lean();
          })
          .then(res => {
            expect(res[0].placement.length).toBe(8);
            res = res[0].placement.filter(el => el.component_name === 'main');
            expect(res.length).toBe(1);

            console.log(' ==> placementId1 ==> ', placementId1);
            console.log(' ==> res ==> ', res);

            expect(res.find(el => el.info.href === '#first' && el._id.toString() === placementId8.toString()).info.areas[0].text).toBe("حرکت رو به جلو ...");
            expect(res.find(el => el.info.href === '#first' && el._id.toString() === placementId8.toString()).updated_value).toBeUndefined();
            expect(res.find(el => el.info.href === '#second' && el._id.toString() === placementId9.toString())).toBeUndefined();
            expect(fs.existsSync(`images/placements/test/${pageId}/${placementId9}`)).toBe(false);
            done();
          })
          .catch(lib.helpers.errorHandler.bind(this));
      });
    });
  }, 20000);

  it("should get error when no page's id is not specified (delete placement)", function (done) {
    rp({
      method: 'post',
      body: {
        placement_id: placementId1,
      },
      json: true,
      jar: contentManager.rpJar,
      uri: lib.helpers.apiTestURL('placement/delete'),
      resolveWithFullResponse: true,
    })
      .then(res => {
        this.fail("Content manager can delete a placement without specified page id");
        done();
      })
      .catch(err => {
        expect(err.statusCode).toBe(errors.pageIdRequired.status);
        expect(err.error).toBe(errors.pageIdRequired.message);
        done();
      });
  });

  it("should get error when placement id is not passed (delete placement)", function (done) {
    rp({
      method: 'post',
      body: {
        page_id: page._id,
      },
      json: true,
      jar: contentManager.rpJar,
      uri: lib.helpers.apiTestURL('placement/delete'),
      resolveWithFullResponse: true,
    })
      .then(res => {
        this.fail("Content manager can delete a placement without specified placement id");
        done();
      })
      .catch(err => {
        expect(err.statusCode).toBe(errors.placementIdRequired.status);
        expect(err.error).toBe(errors.placementIdRequired.message);
        done();
      });
  });
});

describe('POST placement images (slider)', () => {
  let pageId;
  let placementIds = [
    new mongoose.Types.ObjectId(),
    new mongoose.Types.ObjectId(),
    new mongoose.Types.ObjectId(),
    new mongoose.Types.ObjectId(),
  ];
  let adminObj = {
    aid: null,
    jar: null,
  };

  beforeEach(done => {
    lib.dbHelpers.dropAll()
      .then(() => lib.dbHelpers.addAndLoginAgent('cm'))
      .then(res => {
        adminObj.aid = res.aid;
        adminObj.jar = res.rpJar;
        return models()['PageTest']({
          address: 'sampleAddress',
          is_app: false,
          placement: [
            {
              _id: placementIds[0],
              component_name: 'slider',
              variable_name: 'slider',
              info: {
                text: 'slider1text',
                href: 'slider1href',
                column: 0,
              },
              is_finalized: false,
            },
            {
              _id: placementIds[1],
              component_name: 'slider',
              variable_name: 'slider',
              info: {
                text: 'slider2text',
                href: 'slider2href',
                column: 1,
              },
              is_finalized: true,
            },
            {
              _id: placementIds[2],
              component_name: 'slider',
              variable_name: 'slider',
              info: {
                text: 'slider3text',
                href: 'slider3href',
                column: 2,
              },
              is_finalized: true,
            }
          ]
        }).save();
      })
      .then(res => {
        pageId = res._id;
        done();
      })
      .catch(err => {
        console.error(err);
        done();
      })
  });

  it('should upload a new image for a placement (slider)', function (done) {
    this.done = done;
    let _path = `/images/placements/test/${pageId}/${placementIds[0]}/test1.jpeg`;

    rp.post({
      url: lib.helpers.apiTestURL(`placement/image/${pageId}/${placementIds[0]}`),
      formData: {
        component_name: 'slider',
        variable_name: 'slider',
        file: {
          value: fs.readFileSync('spec/api/page/test1.jpeg'),
          options: {
            filename: 'test1.jpeg',
            contentType: 'image/jpeg',
          }
        }
      },
      jar: adminObj.jar,
      resolveWithFullResponse: true,
    }).then(res => {
      expect(res.statusCode).toBe(200);
      res = JSON.parse(res.body);
      expect(res.downloadURL).toContain(_path);
      return models()['PageTest'].find({_id: pageId}).lean();
    })
      .then(res => {
        const pl = res[0].placement.find(el => el._id.toString() === placementIds[0].toString());
        expect(pl).toBeTruthy();
        expect(pl.info.imgUrl).toContain(_path);
        done();
      })
      .catch(lib.helpers.errorHandler.bind(this));
  });

  it('should update the image for a placement (slider)', function (done) {
    this.done = done;
    let _path = `/images/placements/test/${pageId}/${placementIds[2]}/test2.jpeg`;

    rp.post({
      url: lib.helpers.apiTestURL(`placement/image/${pageId}/${placementIds[2]}`),
      formData: {
        component_name: 'slider',
        variable_name: 'slider',
        file: {
          value: fs.readFileSync('spec/api/page/test2.jpeg'),
          options: {
            filename: 'test2.jpeg',
            contentType: 'image/jpeg',
          }
        }
      },
      jar: adminObj.jar,
      resolveWithFullResponse: true,
    }).then(res => {
      expect(res.statusCode).toBe(200);
      res = JSON.parse(res.body);
      expect(res.downloadURL).toContain(_path);
      return models()['PageTest'].find({_id: pageId}).lean();
    })
      .then(res => {
        const pl = res[0].placement.find(el => el._id.toString() === placementIds[2].toString());
        expect(pl).toBeTruthy();
        expect(pl.info.imgUrl).toBeUndefined();
        done();
      })
      .catch(lib.helpers.errorHandler.bind(this));
  });

  it('should update the image for a placement', function (done) {
    this.done = done;
    let _path = `/images/placements/test/${pageId}/${placementIds[1]}/test1.jpeg`;

    rp.post({
      url: lib.helpers.apiTestURL(`placement/image/${pageId}/${placementIds[1]}`),
      formData: {
        component_name: 'slider',
        variable_name: 'slider',
        file: {
          value: fs.readFileSync('spec/api/page/test1.jpeg'),
          options: {
            filename: 'test1.jpeg',
            contentType: 'image/jpeg',
          }
        }
      },
      jar: adminObj.jar,
      resolveWithFullResponse: true,
    }).then(res => {
      expect(res.statusCode).toBe(200);
      res = JSON.parse(res.body);
      expect(res.downloadURL).toContain(_path);
      return models()['PageTest'].find({_id: pageId}).lean();
    })
      .then(res => {
        const pl = res[0].placement.find(el => el._id.toString() === placementIds[1].toString());
        expect(pl).toBeTruthy();
        expect(pl.info.imgUrl).toBeUndefined();
        done();
      })
      .catch(lib.helpers.errorHandler.bind(this));
  });

  it('should upload image for not-inserted placement (return placement_id)', function (done) {
    this.done = done;
    const semiPath = `/images/placements/test/${pageId}`;

    rp({
      method: 'post',
      formData: {
        component_name: 'main',
        file: {
          value: fs.readFileSync('spec/api/page/test2.jpeg'),
          options: {
            filename: 'test2.jpeg',
            contentType: 'image/jpeg',
          }
        }
      },
      uri: lib.helpers.apiTestURL(`placement/image/${pageId}/null`),
      jar: adminObj.jar,
      resolveWithFullResponse: true
    })
      .then(res => {
        expect(res.statusCode).toBe(200);
        res = JSON.parse(res.body);
        console.log('res: ', res);

        expect(res.placementId).toBeDefined();
        expect(res.downloadURL).toContain(semiPath);
        return models()['PageTest'].find({_id: res.placementId}).lean();
      })
      .then(res => {
        expect(res.length).toBe(0);
        done();
      })
      .catch(lib.helpers.errorHandler.bind(this));
  });
});