const char *bloomBlur_frag_src =
"uniform sampler2D tex0;\n"
"uniform vec4 u_blurDir;	// xy: distance between taps in texcoords\n"

"FSIN vec4 v_color;\n"
"FSIN vec2 v_tex0;\n"
"FSIN float v_fog;\n"

"// 9 tap gaussian done with 5 bilinear fetches\n"
"void\n"
"main(void)\n"
"{\n"
"	vec2 uv = vec2(v_tex0.x, 1.0-v_tex0.y);\n"
"	vec2 d = u_blurDir.xy;\n"

"	vec3 c = texture(tex0, uv).rgb * 0.2270270270;\n"
"	c += (texture(tex0, uv + d*1.3846153846).rgb + texture(tex0, uv - d*1.3846153846).rgb) * 0.3162162162;\n"
"	c += (texture(tex0, uv + d*3.2307692308).rgb + texture(tex0, uv - d*3.2307692308).rgb) * 0.0702702703;\n"

"	vec4 color;\n"
"	color.rgb = c;\n"
"	color.a = 1.0;\n"

"	FRAGCOLOR(color);\n"
"}\n"
;
