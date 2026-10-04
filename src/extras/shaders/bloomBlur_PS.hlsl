sampler2D tex : register(s0);
float4 blurDir : register(c10);	// xy: distance between taps in texcoords

// 9 tap gaussian done with 5 bilinear fetches
float4 main(in float2 texcoord : TEXCOORD0) : COLOR0
{
	float2 uv = texcoord.xy;
	float2 d = blurDir.xy;

	float3 c = tex2D(tex, uv).rgb * 0.2270270270;
	c += (tex2D(tex, uv + d*1.3846153846).rgb + tex2D(tex, uv - d*1.3846153846).rgb) * 0.3162162162;
	c += (tex2D(tex, uv + d*3.2307692308).rgb + tex2D(tex, uv - d*3.2307692308).rgb) * 0.0702702703;

	float4 color;
	color.rgb = c;
	color.a = 1.0;
	return color;
}
