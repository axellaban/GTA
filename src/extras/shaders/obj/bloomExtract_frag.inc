const char *bloomExtract_frag_src =
"uniform sampler2D tex0;\n"
"uniform vec4 u_texel;	// xy: size of one source texel\n"
"uniform vec4 u_bounds;	// valid source texcoords: xy min, zw max\n"
"uniform vec4 u_bloomParams;	// x: threshold, y: soft knee\n"

"FSIN vec4 v_color;\n"
"FSIN vec2 v_tex0;\n"
"FSIN float v_fog;\n"

"vec3\n"
"Fetch(vec2 uv)\n"
"{\n"
"	return texture(tex0, clamp(uv, u_bounds.xy, u_bounds.zw)).rgb;\n"
"}\n"

"void\n"
"main(void)\n"
"{\n"
"	vec2 uv = vec2(v_tex0.x, 1.0-v_tex0.y);\n"
"	vec2 px = u_texel.xy;\n"

"	// 4 bilinear taps average a 4x4 block of the full resolution image\n"
"	vec3 c = Fetch(uv + vec2(-1.0, -1.0)*px);\n"
"	c += Fetch(uv + vec2( 1.0, -1.0)*px);\n"
"	c += Fetch(uv + vec2(-1.0,  1.0)*px);\n"
"	c += Fetch(uv + vec2( 1.0,  1.0)*px);\n"
"	c *= 0.25;\n"

"	// bright pass with a soft knee so lights fade in instead of popping\n"
"	float threshold = u_bloomParams.x;\n"
"	float knee = u_bloomParams.y;\n"
"	float brightness = max(c.r, max(c.g, c.b));\n"
"	float soft = clamp(brightness - threshold + knee, 0.0, 2.0*knee);\n"
"	soft = soft*soft / (4.0*knee + 0.00001);\n"
"	float contribution = max(soft, brightness - threshold) / max(brightness, 0.00001);\n"

"	vec4 color;\n"
"	color.rgb = c*contribution;\n"
"	color.a = 1.0;\n"

"	FRAGCOLOR(color);\n"
"}\n"
;
