/**
 * Creates an instance of SeriesData
 *
 * @constructor
 * @this {SeriesData}
 * @param {object} options
 */
function SeriesData(options) {
  if (gl === undefined) {
    var glExistsMessage = "Error: WebGL instance gl required";
    console.log(glExistsMessage);
    throw new Error(glExistsMessage);
  }

  if (tdl === undefined) {
    var tdlExistsMessage = "Error: tdl required";
    console.log(tdlExistsMessage);
    throw new Error(tdlExistsMessage);
  }

  /**
   * If true SeriesData is initialized
   * @type {Boolean}
   */
  this.ready = false;

  /**
   * Default id for fragment shader
   * @type {String}
   */
  this.fragmentShader = 'fragmentShader';

  /**
   * Default id for vertex shader
   * @type {String}
   */
  this.vertexShader = 'vertexShader';

  /**
   * WebGL buffer for coordinate locations
   * @type {Object}
   */
  this.arrayBuffer = gl.createBuffer();

  /**
   * Shader program for rendering 
   * @type {Object}
   */
  this.program = gl.createProgram();

  /**
   * The URL to load a binary formatted file of index values
   * @type {String}
   */
  this.indexUrl = null;

  /**
   * The URL to load a binary formmated file of location values
   * @type {String}
   */
  this.locationUrl = null;

  /**
   * Specify whether to user google maps or timemachine for 
   * latlng to xy conversion.
   * @type {String}
   */
  this.mapType = 'google-maps';

  // Set options
  if (options) {
    this.setOptions(options);
  }

  if (this.indexUrl) {
    this.setIndexDataFromUrl();
  }

  if (this.locationUrl) {
    this.setLocationDataFromUrl();
  }
}

/**
 * Sets any options provided.
 * @param {object} options The options to set.
 */
SeriesData.prototype.setOptions = function(options) {
  if (options.locationUrl !== undefined) {
    this.locationUrl = options.locationUrl;
  }

  if (options.indexUrl !== undefined) {
    this.indexUrl = options.indexUrl;
  }

  if (options.fragmentShader !== undefined) {
    this.fragmentShader = options.fragmentShader;
  }

  if (options.vertexShader !== undefined) {
    this.vertexShader = options.vertexShader;
  } 

  if (options.color !== undefined) {
    this.color = options.color;
  } else {
    this.color = [.0, .0, .0];
  }

  if (options.mapType != undefined) {
    this.mapType = options.mapType;
  }
}

SeriesData.prototype.update_ = function() {
  if (this.index !== undefined && this.locationData !== undefined) {
    this.initGl(this.locationData);
  }
}

SeriesData.prototype.setIndexDataFromUrl = function() {
  var that = this;
  var parseData_ = function() {
    return function(arrayBuffer, exception) {
      if (arrayBuffer) {
        var data = new DataView(arrayBuffer);
        var rawData = new Int32Array(
          data.byteLength / Int32Array.BYTES_PER_ELEMENT);
        var len = rawData.length;
        for (var i = 0; i < len; i++) {
          var date = data.getInt32(i * Int32Array.BYTES_PER_ELEMENT, true);
          rawData[i] = date;
        }
        that.index = rawData;
      }
      that.update_();
    }
  }();
  tdl.io.loadArrayBuffer(this.indexUrl, parseData_);
}

SeriesData.prototype.setLocationDataFromUrl = function() {
  var that = this;
  var parseData_ = function() {
    return function(arrayBuffer, exception) {          
      if (arrayBuffer) {
        var data = new DataView(arrayBuffer);
        var rawData = new Float32Array(
          data.byteLength / Float32Array.BYTES_PER_ELEMENT);
        var len = rawData.length;
        for (var i = 0; i < len; i += 2) {
          var lat = data.getFloat32(i * Float32Array.BYTES_PER_ELEMENT, true);
          var lon = data.getFloat32((i +1 ) * Float32Array.BYTES_PER_ELEMENT, true);
          if (that.mapType == 'google-maps') {
            var pixel = LatLongToPixelXY(lat, lon);            
          } else {
            var pixel = projection.latlngToPoint({lat: lat, lng: lon});
          }
          rawData[i] = pixel.x;
          rawData[i+1] = pixel.y;
        }
        that.locationData = rawData;
      }
      that.update_();
    }
  }();
  tdl.io.loadArrayBuffer(this.locationUrl, parseData_);
}

SeriesData.prototype.initGl = function(data) {
  gl.bindBuffer(gl.ARRAY_BUFFER, this.arrayBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

 // create vertex shader
  var vertexSrc = document.getElementById(this.vertexShader).text;
  var vertexShader = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vertexShader, vertexSrc);
  gl.compileShader(vertexShader);

  // create fragment shader
  var fragmentSrc = document.getElementById(this.fragmentShader).text;
  var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fragmentShader, fragmentSrc);
  gl.compileShader(fragmentShader);

  // link shaders to create our program
  gl.attachShader(this.program, vertexShader);
  gl.attachShader(this.program, fragmentShader);
  gl.linkProgram(this.program);

  gl.useProgram(this.program);

  // enable the 'worldCoord' attribute in the shader to receive buffer
  var attributeLoc = gl.getAttribLocation(this.program, 'worldCoord');
  gl.enableVertexAttribArray(attributeLoc);

  // tell webgl how buffer is laid out (pairs of x,y coords)
  gl.vertexAttribPointer(attributeLoc, 2, gl.FLOAT, false, 0, 0);

  this.ready = true;
}

SeriesData.prototype.draw = function(transform, first, count) {
  gl.useProgram(this.program);

  var matrixLoc = gl.getUniformLocation(this.program, 'mapMatrix');
  gl.uniformMatrix4fv(matrixLoc, false, transform);

  gl.bindBuffer(gl.ARRAY_BUFFER, this.arrayBuffer);

  var attributeLoc = gl.getAttribLocation(this.program, 'worldCoord');
  gl.enableVertexAttribArray(attributeLoc);
  gl.vertexAttribPointer(attributeLoc, 2, gl.FLOAT, false, 0, 0);

  var colorLoc = gl.getUniformLocation(this.program, 'color');
  gl.uniform3fv(colorLoc, new Float32Array(this.color));

  gl.drawArrays(gl.LINE_STRIP, first, count);
}

SeriesData.prototype.getIndexPos = function (key) {
  if (key > this.index[this.index.length - 1]) {
    return this.index.length;
  }
  if (key < this.index[0]) {
    return 0;
  }
  // Use binary search to find index in array
  var min = 0;
  var max = this.index.length - 1;
  var test = 0;
  while (min < max) {
    test = Math.floor(0.5 * (min + max));
    if (key < this.index[test]) {
      max = test - 1;
    } else if (key > this.index[test]) {
      min = test + 1;
    } else {
      break;
    }
  }
  // If found, return index
  // If failed to find, return "closest" (last index tried)
  return test;
}

