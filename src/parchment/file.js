/*
 * File functions and classes
 *
 * Copyright (c) 2008-2011 The Parchment Contributors
 * Licenced under the BSD
 * http://code.google.com/p/parchment
 */

/*

TODO:
	Consider whether it's worth having cross domain requests to things other than the proxy
	Add transport for XDR
	Access buffer if possible (don't change encodings)

*/
 
var file = (function(window, $){

// VBScript code
if ( window.execScript )
{
	execScript(
		
		// Idea from http://stackoverflow.com/questions/1919972/#3050364
		
		// Convert a byte array (xhr.responseBody) into a 16-bit characters string
		// Javascript code will separate the characters back into 8-bit numbers again
		'Function VBCStr(x)\n' +
			'VBCStr=CStr(x)\n' +
		'End Function\n' +
		
		// If the byte array has an odd length, this function is needed to get the last byte
		'Function VBLastAsc(x)\n' +
			'Dim l\n' +
			'l=LenB(x)\n' +
			'If l mod 2 Then\n' +
				'VBLastAsc=AscB(MidB(x,l,1))\n' +
			'Else\n' +
				'VBLastAsc=-1\n' +
			'End If\n' +
		'End Function'
	
	, 'VBScript' );
}

var chrome = /chrome/i.test( navigator.userAgent ),

// Turn Windows-1252 into ISO-8859-1
// There are only 27 differences, so this is an reasonable strategy
// If only we could override with ISO-8859-1...
fixWindows1252 = function( string )
{
	return string
		.replace( /\u20ac/g, '\x80' ).replace( /\u201a/g, '\x82' ).replace( /\u0192/g, '\x83' )
		.replace( /\u201e/g, '\x84' ).replace( /\u2026/g, '\x85' ).replace( /\u2020/g, '\x86' )
		.replace( /\u2021/g, '\x87' ).replace( /\u02c6/g, '\x88' ).replace( /\u2030/g, '\x89' )
		.replace( /\u0160/g, '\x8a' ).replace( /\u2039/g, '\x8b' ).replace( /\u0152/g, '\x8c' )
		.replace( /\u017d/g, '\x8e' ).replace( /\u2018/g, '\x91' ).replace( /\u2019/g, '\x92' )
		.replace( /\u201c/g, '\x93' ).replace( /\u201d/g, '\x94' ).replace( /\u2022/g, '\x95' )
		.replace( /\u2013/g, '\x96' ).replace( /\u2014/g, '\x97' ).replace( /\u02dc/g, '\x98' )
		.replace( /\u2122/g, '\x99' ).replace( /\u0161/g, '\x9a' ).replace( /\u203a/g, '\x9b' )
		.replace( /\u0153/g, '\x9c' ).replace( /\u017e/g, '\x9e' ).replace( /\u0178/g, '\x9f' );
},

// Text to byte array and vice versa
text_to_array = function( text )
{
	var array = [],
	i = 0, l = text.length % 8;
	
	while ( i < l )
	{
		array.push( text.charCodeAt( i++ ) );
	}
	
	for ( l = text.length; i < l; )
	{
		// Unfortunately unless text is cast to a String object there is no shortcut for charCodeAt,
		// and if text is cast to a String object, it's considerably slower.
		array.push( text.charCodeAt(i++), text.charCodeAt(i++), text.charCodeAt(i++), text.charCodeAt(i++),
			text.charCodeAt(i++), text.charCodeAt(i++), text.charCodeAt(i++), text.charCodeAt(i++) );
	}
	return array;
},

array_to_text = function( array )
{
	// String.fromCharCode can be given an array of numbers if we call apply on it!
	return String.fromCharCode.apply( this, array );
},

// Base64 encoding and decoding
// Use the native base64 functions if available

// Run this little function to build the encoding arrays
encoder = [],
decoder = (function( data )
{
	var out = [], i = 0,
	charr;
	while ( i < 65 )
	{
		encoder.push( charr = data.charAt( i ) );
		out[charr] = i++;
	}
	return out;
})( 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=' ),

base64_decode = function(data, out)
{
	if ( window.atob )
	{
		return text_to_array( atob( data ), out );
	}
	
	var out = out || [],
	e, e2,
	i = 0, l = data.length;
	while ( i < l )
	{
		e = decoder[data.charAt(i++)] << 18 | decoder[data.charAt(i++)] << 12 | decoder[data.charAt(i++)] << 6 | decoder[data.charAt(i++)];
		out.push( e >> 16, ( e >> 8 ) & 0xFF, e & 0xFF );
	}
	e = out.pop();
	e2 = out.pop();
	if ( e2 != 64 )
	{
		out.push( e2 );
	}
	if ( e != 64 )
	{
		out.push( e );
	}
	return out;
},

base64_encode = function(data, out)
{
	if ( window.btoa )
	{
		return btoa( array_to_text( data, out ) );
	}
	
	var out = out || '',
	c1, c2, c3, e1, e2, e3, e4,
	i = 0, l = data.length;
	while (i < l)
	{
		c1 = data[i++];
		c2 = data[i++];
		c3 = data[i++];
		e1 = c1 >> 2;
		e2 = ((c1 & 3) << 4) + (c2 >> 4);
		e3 = ((c2 & 15) << 2) + (c3 >> 6);
		e4 = c3 & 63;

		out += encoder[e1] + encoder[e2] + encoder[e3] + encoder[e4];
	}
	if (isNaN(c2))
		out = out.slice(0, -2) + '==';
	else if (isNaN(c3))
		out = out.slice(0, -1) + '=';
	return out;
},

// Convert IE's byte array to an array we can use
bytearray_to_array = function( bytearray )
{
	// VBCStr will convert the byte array into a string, with two bytes combined into one character
	var text = VBCStr( bytearray ),
	// VBLastAsc will return the last character, if the string is of odd length
	last = VBLastAsc( bytearray ),
	result = [],
	i = 0,
	l = text.length % 4,
	thischar;
	
	while ( i < l )
	{
		result.push(
			( thischar = text.charCodeAt(i++) ) & 0xff, thischar >> 8
		);
	}
	
	l = text.length;
	while ( i < l )
	{
		result.push(
			( thischar = text.charCodeAt(i++) ) & 0xff, thischar >> 8,
			( thischar = text.charCodeAt(i++) ) & 0xff, thischar >> 8,
			( thischar = text.charCodeAt(i++) ) & 0xff, thischar >> 8,
			( thischar = text.charCodeAt(i++) ) & 0xff, thischar >> 8
		);
	}
	
	if ( last > -1 )
	{
		result.push( last );
	}
	
	return result;
},

// XMLHttpRequest feature support
xhr = jQuery.ajaxSettings.xhr(),
support = {
	// Unfortunately in Opera < 10.5 overrideMimeType() doesn't work
	binary:
		xhr.overrideMimeType && !( $.browser.opera && parseFloat( $.browser.version ) < 10.5 ) ? 'charset' :
		'responseBody' in xhr ? 'responseBody' :
		0
},

// Process a binary XHR
process_binary_XHR = function( data, textStatus, jqXHR )
{
	var array, buffer, text;
	
	data = $.trim( data );
	
	// Decode base64
	if ( jqXHR.mode == 'base64' )
	{
		if ( window.atob )
		{
			text = atob( data );
			array = text_to_array( text );
		}
		else
		{
			array = base64_decode( data );
			text = array_to_text( array );
		}
	}
	
	// Binary support through charset=windows-1252
	else if ( jqXHR.mode == 'charset' )
	{
		text = fixWindows1252( data );
		array = text_to_array( text );
	}
	
	// Access responseBody
	else
	{
		array = bytearray_to_array( jqXHR.xhr.responseBody );
		text = array_to_text( array );
	}
	
	jqXHR.responseArray = array;
	jqXHR.responseText = text;
};

// Clean-up the temp XHR used above
xhr = undefined;

// Prefilters for binary ajax
$.ajaxPrefilter( 'binary', function( options, originalOptions, jqXHR )
{
	// Chrome > 4 doesn't allow file:// to file:// XHR
	// It should however work for the rest of the world, so we have to test here, rather than when first checking for binary support
	var binary = LOCAL && !options.crossDomain && chrome ? 0 : support.binary,
	
	// Expose the real XHR object onto the jqXHR
	XHRFactory = options.xhr;
	options.xhr = function()
	{
		return jqXHR.xhr = XHRFactory.apply( options );
	};
	
	// Set up the options and jqXHR
	options.binary = binary;
	jqXHR.done( process_binary_XHR );
	
	// Options for jsonp, which may not be used if we redirect to 'text'
	options.jsonp = false;
	options.jsonpCallback = 'processBase64Zcode';
	jqXHR.mode = 'base64';
	
	// Load a legacy file
	if ( options.url.slice( -3 ).toLowerCase() == '.js' )
	{
		return 'jsonp';
	}
	
	// Binary support and same domain: use a normal text handler
	// Encoding stuff is done in the text prefilter below
	if ( binary && !options.crossDomain )
	{
		return 'text';
	}
	
	// Use a backup legacy file if provided
	if ( options.legacy )
	{
		options.url = options.legacy;
		return 'jsonp';
	}
	
	// Use the proxy when no binary support || cross domain request
	options.data = 'url=' + options.url;
	options.url = parchment.options.proxy_url;
	
	if ( binary && $.support.cors )
	{
		return 'text';
	}
	
	options.data += '&encode=base64&callback=pproxy';
	options.jsonpCallback = 'pproxy';
	return 'jsonp';
});

// Set options for binary requests
$.ajaxPrefilter( 'text', function( options, originalOptions, jqXHR )
{
	jqXHR.mode = options.binary;
	
	if ( jqXHR.mode == 'charset' )
	{
		options.mimeType = 'text/plain; charset=windows-1252';
	}
});

// Converters are set in intro.js

/*
	// Images made from byte arrays
	file.image = base2.Base.extend({
		// Initialise the image with a byte array
		constructor: function init_image(chunk)
		{
			this.chunk = chunk;

			this.dataURI = function create_dataURI()
			{
				// Only create the image when first requested, the encoding could be quite slow
				// Would be good to replace with a getter if it can be done reliably
				var encoded = encode_base64(this.chunk.data);
				if (this.chunk.type == 'PNG ')
					this.URI = 'data:image/png;base64,' + encoded;
				else if (this.chunk.type == 'JPEG')
					this.URI = 'data:image/jpeg;base64,' + encoded;
				this.dataURI = function() {return this.URI;};
				return this.URI;
			};
		}
	});
*/

// Expose
return parchment.file = {
	text_to_array: text_to_array,
	array_to_text: array_to_text,
	base64_decode: base64_decode,
	base64_encode: base64_encode,
	support: support
};

})(window, jQuery);