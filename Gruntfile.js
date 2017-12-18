module.exports = function( grunt ) {
  let src = [ "src/**/*.js" ],
    fixCodeStyle = grunt.option( "fixCodeStyle" ) ? true : false;
  if ( grunt.option( "file" ) ) {
    src = grunt.option( "file" );
  }
  // Project configuration.
  grunt.initConfig({
    pkg: grunt.file.readJSON( "package.json" ),
    env: {
      dev: {
        src: "dev/env"
      }
    },
    nodemon: {
      dev: {
        script: "dev/js/index.js"
      }
    },
    mochaTest: {
      test: {
        src: "test/**/*.js"
      }
    },
    jscs: {
      src: src,
      options: {
        config: ".jscsrc",
        fix: fixCodeStyle
      }
    }
  });

  // Load the plugin that provides the "uglify" task.
  grunt.loadNpmTasks( "grunt-env" );
  grunt.loadNpmTasks( "grunt-contrib-nodemon" );
  grunt.loadNpmTasks( "grunt-mocha-test" );
  grunt.loadNpmTasks( "grunt-jscs" );

  // Default task(s).
  grunt.registerTask( "default", [ "env:dev", "nodemon" ] );
  grunt.registerTask( "test", [ "env:dev", "mochaTest" ] );

};
