#!/bin/sh
# Compile HLSL shaders without Windows/fxc, using vkd3d-compiler (vkd3d >= 1.10),
# and write obj/<name>.cso and obj/<name>.inc like make_hlsl.cmd + makeinc_hlsl.sh do.
# usage: ./make_hlsl_vkd3d.sh fxaa_PS.hlsl modernGrade_PS.hlsl ...
# set VKD3D_COMPILER to point to the compiler if it's not in PATH.
VKD3D=${VKD3D_COMPILER:-vkd3d-compiler}
cd "$(dirname "$0")" || exit 1
for f in "$@"; do
	f=$(basename "$f")
	name=${f%.hlsl}
	case $name in
	# these need more than the 64 arithmetic instructions ps_2_0 allows
	fxaa_PS|modernGrade_PS)	profile=ps_2_a ;;
	*VS)			profile=vs_2_0 ;;
	*)			profile=ps_2_0 ;;
	esac
	echo "$f ($profile)"
	"$VKD3D" -x hlsl -b d3dbc -p $profile -e main -o obj/$name.cso $f || exit 1
	od -An -v -tx1 obj/$name.cso | awk -v name="${name}_cso" '
		BEGIN { printf "static unsigned char %s[] = {\n", name }
		{ for(i = 1; i <= NF; i++) bytes[n++] = $i }
		END {
			for(i = 0; i < n; i++){
				if(i % 12 == 0) printf "  "
				printf "0x%s", bytes[i]
				if(i < n-1) printf(i % 12 == 11 ? ",\n" : ", ")
			}
			printf "\n};\n"
		}' > obj/$name.inc
done
