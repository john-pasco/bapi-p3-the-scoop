// import and require the modules for the database work
const yaml = require('js-yaml');
const fs   = require('fs');
const databaseFile = './database.yml';
// database is let instead of const to allow us to modify it in test.js
let database = {
  users: {},
  articles: {},
  nextArticleId: 1,
  comments: {},
  nextCommentId: 1
};

const routes = {
  '/users': {
    'POST': getOrCreateUser
  },
  '/users/:username': {
    'GET': getUser
  },
  '/articles': {
    'GET': getArticles,
    'POST': createArticle
  },
  '/articles/:id': {
    'GET': getArticle,
    'PUT': updateArticle,
    'DELETE': deleteArticle
  },
  '/articles/:id/upvote': {
    'PUT': upvoteArticle
  },
  '/articles/:id/downvote': {
    'PUT': downvoteArticle
  },
  '/comments': {
    'POST': createComment
  },
  '/comments/:id': {
    'GET': getComment,
    'PUT': updateComment,
    'DELETE': deleteComment
  },
  '/comments/:id/upvote': {
    'PUT': upVoteComment
  },
  '/comments/:id/downvote': {
    'PUT': downVoteComment
  }
};

function loadDatabase() {
  console.log('loadDatabase triggered');
  try {
    var doc = yaml.safeLoad(fs.readFileSync(databaseFile, 'utf8'));
    console.log(doc);
  } catch (e) {
    console.log(e);
  }
};

function saveDatabase(){
  console.log('saveDatabase triggered');
  try {
    fs.writeFileSync(databaseFile, JSON.stringify(database, null, 2));
  } catch (e) {
    console.log(e);
  }
};

function createComment(url, request){

  const response = {}; // start creating the response object
  const holdingObject = {}; // create a temp holding object to build the comment
  
  // do initial validation to checking that the objects and properties all exist
  if(request.body && 
    request.body.comment && 
    request.body.comment.body && 
    request.body.comment.username && 
    request.body.comment.articleId
  ){
    
    // there is a second layer of validation
    let userResponse = getUser(url+'/'+request.body.comment.username,request);
    let articleResponse = getArticle(url+'/'+request.body.comment.articleId,request);
    
    if(userResponse.status === 200 && articleResponse.status === 200){
      //if it passes validation do the database operations

      let commentId = database.nextCommentId;

      //build the holding object as it is used in multiple places further on
      holdingObject.id = commentId;
      holdingObject.body = request.body.comment.body;
      holdingObject.username = request.body.comment.username;
      holdingObject.articleId = request.body.comment.articleId;
      holdingObject.upvotedBy = [];
      holdingObject.downvotedBy = [];

      // 1. save it to the db
      database.comments[commentId] = holdingObject;

      // 2. increment the nextCommentId field
      database.nextCommentId++;

      // 3. add a newly created comment's ID to the author's comment IDs
      database.users[userResponse.body.user.username].commentIds.push(commentId);

      // 4. should add a newly created comment's ID to the article's comment IDs
      database.articles[articleResponse.body.article.id].commentIds.push(commentId);

      // 5. build the successful http response object
      response.body = {comment : holdingObject};
      response.status = 201;
      return response;

    }else{
      // This is a failure as the user or article does not exist
      response.status = 400;
      return response;
    }
  }else{
    // This is a failure as the comment is malformed in some way
    response.status = 400;
    return response;
  }
};

function getComment(url,request){

  // adapted from getArticle

  const id = Number(url.split('/').filter(segment => segment)[1]);
  const comment = database.comments[id];
  const response = {};

  if (comment) {
    response.body = {comment: comment};
    response.status = 200;
  } else if (id) {
    response.status = 404;
  } else {
    response.status = 400;
  }

  return response;
  
}

function updateComment(url, request){
  // set up the response object
  const response = {};
  //start by validating we have received valid data in the comment
  if(request.body && 
    request.body.comment && 
    request.body.comment.id && 
    request.body.comment.body && 
    request.body.comment.username && 
    request.body.comment.articleId
  ){    
    const commentResponse = getComment(url,request);

    if(commentResponse.status === 200 && commentResponse.body.comment.id === request.body.comment.id){
      
      // save it to the db
      database.comments[request.body.comment.id].body = request.body.comment.body;
      
      response.body = {comment: request.body.comment.body};
      response.status = 200;
      return response;
    }else{
      response.status = 404;
      return response;
    }
  }else{
    response.status = 400;
    return response;
  } 
};


function deleteComment(url, request){
  
  //  - Receives comment ID from URL parameter
  const id = Number(url.split('/').filter(segment => segment)[1]);
  //console.log(`The id is = ${id}`);
  
  // set up the response object
  const response = {};
  
  const commentResponse = getComment(url,request);
  
  if(commentResponse.status === 200 && commentResponse.body.comment.id === id){
    //  - Deletes comment from database
    database.comments[id] = null;

    // and removes all references to its ID from corresponding user and article models, returns 204 response
    
    // users
    const userCommentIds = database.users[commentResponse.body.comment.username].commentIds;
    userCommentIds.splice(userCommentIds.indexOf(id), 1);

    // articles
    const userArticleIds = database.articles[commentResponse.body.comment.articleId].commentIds;
    userArticleIds.splice(userArticleIds.indexOf(id), 1);

    response.status = 204;
    return response;

  }else{
    //  - If no ID is supplied or comment with supplied ID doesn't exist, returns 400 response
    // incorrect test expects a 404 response
    response.status = 404;
    return response;
  }


};

function upVoteComment(url, request){

  return voteOnComment(url, request, 'up')

  // originally created this as its own method before reusing the code on downVoteComment
  // left here so you can see this
  if(false){

    // set up the response object
    const response = {};

    //start by validating we have received valid data in the request object
    if(request.body && 
      request.body.username
    ){
      //  - Receives comment ID from URL parameter and username from `username` property of request body
      const id = Number(url.split('/').filter(segment => segment)[1]);
      const username = request.body.username;
      
      const commentResponse = getComment(url,request);
      const userResponse = getUser('/users/'+username,null);
      
      //  - If no ID is supplied, comment with supplied ID doesn't exist, 
      //    or user with supplied username doesn't exist, returns 400 response
      if(commentResponse.status === 200 && 
        userResponse.status === 200 && 
        commentResponse.body.comment.id === id){
        
        //  - Adds supplied username to `upvotedBy` of corresponding comment 
        //    if user hasn't already upvoted the comment, 
        //    removes username from `downvotedBy` if that user had previously downvoted the comment, 
        const comment = commentResponse.body.comment;
        upvote(comment, username);
        
        // returns 200 response with comment on `comment` property of response body
        response.status = 200;
        response.body = {comment:comment};
        return response;
      }else{
        response.status = 400;
        return response;
      }
    }else{
      response.status = 400;
      return response;
    }

  }

};
function downVoteComment(url, request){
  return voteOnComment(url, request, 'down')
};


function voteOnComment(url, request, upOrDown){

  // set up the response object
  const response = {};

  // catch any direct entry
  if(upOrDown !== 'up' && upOrDown !== 'down'){
    response.status = 400;
    return response;
  }

  //start by validating we have received valid data in the request object
  if(request.body && 
    request.body.username
  ){
    //  - Receives comment ID from URL parameter and username from `username` property of request body
    const id = Number(url.split('/').filter(segment => segment)[1]);
    const username = request.body.username;
    
    const commentResponse = getComment(url,request);
    const userResponse = getUser('/users/'+username,null);
    
    //  - If no ID is supplied, comment with supplied ID doesn't exist, 
    //    or user with supplied username doesn't exist, returns 400 response
    if(commentResponse.status === 200 && 
      userResponse.status === 200 && 
      commentResponse.body.comment.id === id){
      
      //  - Adds supplied username to `upvotedBy / downvotedBy` of corresponding comment 
      //    if user hasn't already upvoted the comment, 
      //    removes username from `upvotedBy / downvotedBy` if that user had previously upvoted / downvoted the comment, 
      const comment = commentResponse.body.comment;
      if(upOrDown === 'up'){
        upvote(comment, username);
      }else{
        downvote(comment, username);
      }
      
      // returns 200 response with comment on `comment` property of response body
      response.status = 200;
      response.body = {comment:comment};
      return response;
    }else{
      response.status = 400;
      return response;
    }
  }else{
    response.status = 400;
    return response;
  }

};


function getUser(url, request) {
  const username = url.split('/').filter(segment => segment)[1];
  const user = database.users[username];
  const response = {};

  if (user) {
    const userArticles = user.articleIds.map(
        articleId => database.articles[articleId]);
    const userComments = user.commentIds.map(
        commentId => database.comments[commentId]);
    response.body = {
      user: user,
      userArticles: userArticles,
      userComments: userComments
    };
    response.status = 200;
  } else if (username) {
    response.status = 404;
  } else {
    response.status = 400;
  }

  return response;
}

function getOrCreateUser(url, request) {
  const username = request.body && request.body.username;
  const response = {};

  if (database.users[username]) {
    response.body = {user: database.users[username]};
    response.status = 200;
  } else if (username) {
    const user = {
      username: username,
      articleIds: [],
      commentIds: []
    };
    database.users[username] = user;

    response.body = {user: user};
    response.status = 201;
  } else {
    response.status = 400;
  }

  return response;
}

function getArticles(url, request) {
  const response = {};

  response.status = 200;
  response.body = {
    articles: Object.keys(database.articles)
        .map(articleId => database.articles[articleId])
        .filter(article => article)
        .sort((article1, article2) => article2.id - article1.id)
  };

  return response;
}

function getArticle(url, request) {
  const id = Number(url.split('/').filter(segment => segment)[1]);
  const article = database.articles[id];
  const response = {};

  if (article) {
    article.comments = article.commentIds.map(
      commentId => database.comments[commentId]);

    response.body = {article: article};
    response.status = 200;
  } else if (id) {
    response.status = 404;
  } else {
    response.status = 400;
  }

  return response;
}

function createArticle(url, request) {
  const requestArticle = request.body && request.body.article;
  const response = {};

  if (requestArticle && requestArticle.title && requestArticle.url &&
      requestArticle.username && database.users[requestArticle.username]) {
    const article = {
      id: database.nextArticleId++,
      title: requestArticle.title,
      url: requestArticle.url,
      username: requestArticle.username,
      commentIds: [],
      upvotedBy: [],
      downvotedBy: []
    };

    database.articles[article.id] = article;
    database.users[article.username].articleIds.push(article.id);

    response.body = {article: article};
    response.status = 201;
  } else {
    response.status = 400;
  }

  return response;
}

function updateArticle(url, request) {
  const id = Number(url.split('/').filter(segment => segment)[1]);
  const savedArticle = database.articles[id];
  const requestArticle = request.body && request.body.article;
  const response = {};

  if (!id || !requestArticle) {
    response.status = 400;
  } else if (!savedArticle) {
    response.status = 404;
  } else {
    savedArticle.title = requestArticle.title || savedArticle.title;
    savedArticle.url = requestArticle.url || savedArticle.url;

    response.body = {article: savedArticle};
    response.status = 200;
  }

  return response;
}

function deleteArticle(url, request) {
  const id = Number(url.split('/').filter(segment => segment)[1]);
  const savedArticle = database.articles[id];
  const response = {};

  if (savedArticle) {
    database.articles[id] = null;
    savedArticle.commentIds.forEach(commentId => {
      const comment = database.comments[commentId];
      database.comments[commentId] = null;
      const userCommentIds = database.users[comment.username].commentIds;
      userCommentIds.splice(userCommentIds.indexOf(id), 1);
    });
    const userArticleIds = database.users[savedArticle.username].articleIds;
    userArticleIds.splice(userArticleIds.indexOf(id), 1);
    response.status = 204;
  } else {
    response.status = 400;
  }

  return response;
}

function upvoteArticle(url, request) {
  const id = Number(url.split('/').filter(segment => segment)[1]);
  const username = request.body && request.body.username;
  let savedArticle = database.articles[id];
  const response = {};

  if (savedArticle && database.users[username]) {
    savedArticle = upvote(savedArticle, username);

    response.body = {article: savedArticle};
    response.status = 200;
  } else {
    response.status = 400;
  }

  return response;
}

function downvoteArticle(url, request) {
  const id = Number(url.split('/').filter(segment => segment)[1]);
  const username = request.body && request.body.username;
  let savedArticle = database.articles[id];
  const response = {};

  if (savedArticle && database.users[username]) {
    savedArticle = downvote(savedArticle, username);

    response.body = {article: savedArticle};
    response.status = 200;
  } else {
    response.status = 400;
  }

  return response;
}

function upvote(item, username) {
  if (item.downvotedBy.includes(username)) {
    item.downvotedBy.splice(item.downvotedBy.indexOf(username), 1);
  }
  if (!item.upvotedBy.includes(username)) {
    item.upvotedBy.push(username);
  }
  return item;
}

function downvote(item, username) {
  if (item.upvotedBy.includes(username)) {
    item.upvotedBy.splice(item.upvotedBy.indexOf(username), 1);
  }
  if (!item.downvotedBy.includes(username)) {
    item.downvotedBy.push(username);
  }
  return item;
}

// Write all code above this line.

const http = require('http');
const url = require('url');

const port = process.env.PORT || 4000;
const isTestMode = process.env.IS_TEST_MODE;

const requestHandler = (request, response) => {
  const url = request.url;
  const method = request.method;
  const route = getRequestRoute(url);

  if (method === 'OPTIONS') {
    var headers = {};
    headers["Access-Control-Allow-Origin"] = "*";
    headers["Access-Control-Allow-Methods"] = "POST, GET, PUT, DELETE, OPTIONS";
    headers["Access-Control-Allow-Credentials"] = false;
    headers["Access-Control-Max-Age"] = '86400'; // 24 hours
    headers["Access-Control-Allow-Headers"] = "X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept";
    response.writeHead(200, headers);
    return response.end();
  }

  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.setHeader(
      'Access-Control-Allow-Headers', 'X-Requested-With,content-type');

  if (!routes[route] || !routes[route][method]) {
    response.statusCode = 400;
    return response.end();
  }

  if (method === 'GET' || method === 'DELETE') {
    const methodResponse = routes[route][method].call(null, url);
    !isTestMode && (typeof saveDatabase === 'function') && saveDatabase();

    response.statusCode = methodResponse.status;
    response.end(JSON.stringify(methodResponse.body) || '');
  } else {
    let body = [];
    request.on('data', (chunk) => {
      body.push(chunk);
    }).on('end', () => {
      body = JSON.parse(Buffer.concat(body).toString());
      const jsonRequest = {body: body};
      const methodResponse = routes[route][method].call(null, url, jsonRequest);
      !isTestMode && (typeof saveDatabase === 'function') && saveDatabase();

      response.statusCode = methodResponse.status;
      response.end(JSON.stringify(methodResponse.body) || '');
    });
  }
};

const getRequestRoute = (url) => {
  const pathSegments = url.split('/').filter(segment => segment);

  if (pathSegments.length === 1) {
    return `/${pathSegments[0]}`;
  } else if (pathSegments[2] === 'upvote' || pathSegments[2] === 'downvote') {
    return `/${pathSegments[0]}/:id/${pathSegments[2]}`;
  } else if (pathSegments[0] === 'users') {
    return `/${pathSegments[0]}/:username`;
  } else {
    return `/${pathSegments[0]}/:id`;
  }
}

if (typeof loadDatabase === 'function' && !isTestMode) {
  const savedDatabase = loadDatabase();
  if (savedDatabase) {
    for (key in database) {
      database[key] = savedDatabase[key] || database[key];
    }
  }
}

const server = http.createServer(requestHandler);

server.listen(port, (err) => {
  if (err) {
    return console.log('Server did not start succesfully: ', err);
  }

  console.log(`Server is listening on ${port}`);
});