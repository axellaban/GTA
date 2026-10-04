const char *fxaa_frag_src =
"uniform sampler2D tex0;\n"
"uniform vec4 u_texel;	// xy: size of one source texel\n"
"uniform vec4 u_bounds;	// valid source texcoords: xy min, zw max\n"

"FSIN vec4 v_color;\n"
"FSIN vec2 v_tex0;\n"
"FSIN float v_fog;\n"

"// FXAA (after Timothy Lottes), cheap variant: find the local edge\n"
"// direction from the luma of the four diagonal neighbours and blur along it.\n"
"#define FXAA_SPAN_MAX 8.0\n"
"#define FXAA_REDUCE_MUL (1.0/8.0)\n"
"#define FXAA_REDUCE_MIN (1.0/128.0)\n"

"vec3\n"
"Fetch(vec2 uv)\n"
"{\n"
"	return texture(tex0, clamp(uv, u_bounds.xy, u_bounds.zw)).rgb;\n"
"}\n"

"float\n"
"Luma(vec3 c)\n"
"{\n"
"	return dot(c, vec3(0.299, 0.587, 0.114));\n"
"}\n"

"void\n"
"main(void)\n"
"{\n"
"	vec2 uv = vec2(v_tex0.x, 1.0-v_tex0.y);\n"
"	vec2 px = u_texel.xy;\n"

"	vec3 rgbNW = Fetch(uv + vec2(-1.0, -1.0)*px);\n"
"	vec3 rgbNE = Fetch(uv + vec2( 1.0, -1.0)*px);\n"
"	vec3 rgbSW = Fetch(uv + vec2(-1.0,  1.0)*px);\n"
"	vec3 rgbSE = Fetch(uv + vec2( 1.0,  1.0)*px);\n"
"	vec3 rgbM  = Fetch(uv);\n"

"	float lumaNW = Luma(rgbNW);\n"
"	float lumaNE = Luma(rgbNE);\n"
"	float lumaSW = Luma(rgbSW);\n"
"	float lumaSE = Luma(rgbSE);\n"
"	float lumaM  = Luma(rgbM);\n"
"	float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));\n"
"	float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));\n"

"	vec2 dir;\n"
"	dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));\n"
"	dir.y =  ((lumaNW + lumaSW) - (lumaNE + lumaSE));\n"
"	float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * (0.25 * FXAA_REDUCE_MUL), FXAA_REDUCE_MIN);\n"
"	float rcpDirMin = 1.0/(min(abs(dir.x), abs(dir.y)) + dirReduce);\n"
"	dir = clamp(dir*rcpDirMin, vec2(-FXAA_SPAN_MAX), vec2(FXAA_SPAN_MAX)) * px;\n"

"	vec3 rgbA = 0.5 * (Fetch(uv + dir*(1.0/3.0 - 0.5)) + Fetch(uv + dir*(2.0/3.0 - 0.5)));\n"
"	vec3 rgbB = rgbA*0.5 + 0.25 * (Fetch(uv - dir*0.5) + Fetch(uv + dir*0.5));\n"
"	float lumaB = Luma(rgbB);\n"

"	vec4 color;\n"
"	color.rgb = (lumaB < lumaMin || lumaB > lumaMax) ? rgbA : rgbB;\n"
"	color.a = 1.0;\n"

"	FRAGCOLOR(color);\n"
"}\n"
;
