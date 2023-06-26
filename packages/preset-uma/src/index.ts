

export default ()=>{
  return {
    plugins: [
      require.resolve('./registerMethods'),

      require.resolve('./features/404/404'),


      require.resolve('./commands/version'),
      require.resolve('./commands/help'),
      require.resolve('./commands/setup'),
    ].filter(Boolean)
  };
}